import { Injectable } from '@nestjs/common';
import { requireActiveAccount } from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { AppError } from '../../core/error.js';
import {
  place_dedupe_key,
  type PlaceInput,
  type PlaceList,
} from './places.type.js';
import {
  insertBookmark,
  placeRows,
  placeWhere,
  reviewRows,
} from './sql/places.sql.js';

type PhotoInput = {
  request_key: string;
  content_hash: string;
  url: string;
  public_id: string;
};
type Photo = PhotoInput & {
  id: string;
  place_id: string;
  author_id: string | null;
  created_at: Date;
};
const unavailable = () =>
  new AppError(404, 'PLACE_NOT_FOUND', 'This place is no longer available.');

@Injectable()
export class PlacesRepository {
  constructor(private readonly database: PostgresService) {}

  async list(user: string, input: PlaceList) {
    const where = [user, input.scope, input.type, input.query, null];
    return this.database.transaction(async (tx) => {
      const count = await tx.query<{ total: number }>(
        'SELECT count(*)::int AS total ' + placeWhere,
        where,
      );
      const { rows } = await tx.query(placeRows, [
        ...where,
        1,
        input.page_size,
        (input.page - 1) * input.page_size,
      ]);
      return {
        rows,
        total: count.rows[0]!.total,
        page: input.page,
        page_size: input.page_size,
      };
    }, 'REPEATABLE READ');
  }

  async detail(user: string, id: string) {
    return this.database.transaction(async (tx) => {
      const { rows } = await tx.query(placeRows, [
        user,
        'all',
        null,
        '',
        id,
        10,
        1,
        0,
      ]);
      if (!rows[0]) throw unavailable();
      const own = await tx.query(
        'SELECT id,score,comment,updated_at FROM place_reviews WHERE place_id=$1 AND user_id=$2',
        [id, user],
      );
      return { ...rows[0], own_review: own.rows[0] ?? null };
    }, 'REPEATABLE READ');
  }

  async reviews(id: string, page: number) {
    return this.database.transaction(async (tx) => {
      const total = await tx.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM place_reviews WHERE place_id=$1',
        [id],
      );
      const { rows } = await tx.query(reviewRows, [id, (page - 1) * 20]);
      return { rows, total: total.rows[0]!.total, page, page_size: 20 };
    }, 'REPEATABLE READ');
  }

  private async lock(tx: SqlClient, key: string) {
    await tx.query('SELECT pg_advisory_xact_lock(720061,hashtext($1))', [key]);
  }

  private action(tx: SqlClient, user: string, id: string, name: string) {
    return insertUserLog(tx, {
      actor_id: user,
      entity_type: 'CommunityPlace',
      entity_id: id,
      action: name,
    });
  }

  async create(user: string, input: PlaceInput) {
    return this.database.transaction(async (tx) => {
      await requireActiveAccount(tx, user);
      const key = place_dedupe_key(input);
      await this.lock(tx, key);
      const prior = await tx.query<{ id: string }>(
        'SELECT id FROM community_places WHERE dedupe_key=$1',
        [key],
      );
      let place = prior.rows[0];
      if (!place) {
        const created = await tx.query<{ id: string }>(
          `INSERT INTO community_places (id,created_by_id,dedupe_key,name,address,latitude,longitude,
            place_type,description,phone,website,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp()) RETURNING id`,
          [
            nextEntityId(),
            user,
            key,
            input.name,
            input.address,
            input.latitude,
            input.longitude,
            input.place_type,
            input.description,
            input.phone,
            input.website,
          ],
        );
        place = created.rows[0]!;
      }
      await tx.query(insertBookmark, [nextEntityId(), user, place.id]);
      await this.action(tx, user, place.id, 'SAVE_SHARED_PLACE');
      return { id: place.id };
    });
  }

  private async write<T>(
    user: string,
    id: string,
    action: string,
    change: (tx: SqlClient) => Promise<T>,
  ) {
    return this.database.transaction(async (tx) => {
      await requireActiveAccount(tx, user);
      await this.lock(tx, id);
      const enabled = await tx.query(
        'SELECT id FROM community_places WHERE id=$1 AND archived_at IS NULL',
        [id],
      );
      if (!enabled.rowCount) throw unavailable();
      const result = await change(tx);
      await this.action(tx, user, id, action);
      return result;
    });
  }

  update(user: string, id: string, input: PlaceInput & { version: number }) {
    return this.write(user, id, 'EDIT_SHARED_PLACE', async (tx) => {
      const key = place_dedupe_key(input);
      await this.lock(tx, key);
      const duplicate = await tx.query(
        'SELECT 1 FROM community_places WHERE dedupe_key=$1 AND id<>$2',
        [key, id],
      );
      if (duplicate.rowCount)
        throw new AppError(
          409,
          'PLACE_ALREADY_EXISTS',
          'This place already exists. Save the existing place instead.',
        );
      const result = await tx.query(
        `UPDATE community_places SET dedupe_key=$4,name=$5,address=$6,latitude=$7,longitude=$8,place_type=$9,description=$10,
          phone=CASE WHEN $11::boolean THEN $12 ELSE phone END,
          website=CASE WHEN $13::boolean THEN $14 ELSE website END,
          version=version+1,updated_at=clock_timestamp()
        WHERE id=$1 AND created_by_id=$2 AND version=$3 AND archived_at IS NULL`,
        [
          id,
          user,
          input.version,
          key,
          input.name,
          input.address,
          input.latitude,
          input.longitude,
          input.place_type,
          input.description,
          input.phone !== undefined,
          input.phone,
          input.website !== undefined,
          input.website,
        ],
      );
      if (!result.rowCount)
        throw new AppError(
          409,
          'PLACE_CHANGED',
          'Only the contributor can edit this place. Refresh before trying again.',
        );
      await tx.query(
        'UPDATE saved_places SET label=$2,address=$3,latitude=$4,longitude=$5,place_type=$6,updated_at=clock_timestamp() WHERE community_place_id=$1',
        [
          id,
          input.name,
          input.address,
          input.latitude,
          input.longitude,
          input.place_type,
        ],
      );
      return { id };
    });
  }

  remove(user: string, id: string, version: number) {
    return this.write(user, id, 'ARCHIVE_SHARED_PLACE', async (tx) => {
      const archived = await tx.query(
        `UPDATE community_places SET archived_at=clock_timestamp(),dedupe_key='archived:'||id,
          version=version+1,updated_at=clock_timestamp()
        WHERE id=$1 AND created_by_id=$2 AND version=$3 AND archived_at IS NULL`,
        [id, user, version],
      );
      if (!archived.rowCount)
        throw new AppError(
          409,
          'PLACE_CHANGED',
          'Only the contributor can delete this place. Refresh before trying again.',
        );
      return { removed: true };
    });
  }

  bookmark(user: string, id: string, value: boolean) {
    return this.write(
      user,
      id,
      value ? 'SAVE_SHARED_PLACE' : 'UNSAVE_SHARED_PLACE',
      async (tx) => {
        if (value) await tx.query(insertBookmark, [nextEntityId(), user, id]);
        else
          await tx.query(
            'DELETE FROM saved_places WHERE user_id=$1 AND community_place_id=$2',
            [user, id],
          );
        return { saved: value };
      },
    );
  }

  visit(user: string, id: string, value: boolean) {
    return this.write(
      user,
      id,
      value ? 'MARK_PLACE_VISITED' : 'CLEAR_PLACE_VISIT',
      async (tx) => {
        if (value)
          await tx.query(
            'INSERT INTO place_visits (id,place_id,user_id) VALUES ($1,$2,$3) ON CONFLICT (place_id,user_id) DO NOTHING',
            [nextEntityId(), id, user],
          );
        else
          await tx.query(
            'DELETE FROM place_visits WHERE place_id=$1 AND user_id=$2',
            [id, user],
          );
        return { visited: value };
      },
    );
  }

  review(
    user: string,
    id: string,
    input: { score: number; comment: string } | null,
  ) {
    return this.write(
      user,
      id,
      input ? 'REVIEW_PLACE' : 'REMOVE_PLACE_REVIEW',
      async (tx) => {
        if (!input) {
          await tx.query(
            'DELETE FROM place_reviews WHERE place_id=$1 AND user_id=$2',
            [id, user],
          );
          return { removed: true };
        }
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO place_reviews (id,place_id,user_id,score,comment,updated_at)
        VALUES ($1,$2,$3,$4,$5,clock_timestamp()) ON CONFLICT (place_id,user_id)
        DO UPDATE SET score=EXCLUDED.score,comment=EXCLUDED.comment,updated_at=clock_timestamp() RETURNING id`,
          [nextEntityId(), id, user, input.score, input.comment],
        );
        return rows[0]!;
      },
    );
  }

  async photo_by_key(user: string, key: string, db: SqlClient = this.database) {
    const { rows } = await db.query<Photo>(
      'SELECT * FROM place_photos WHERE author_id=$1 AND request_key=$2',
      [user, key],
    );
    return rows[0] ?? null;
  }

  async photo_capacity(id: string) {
    const result = await this.database.query<{ total: number }>(
      `SELECT (SELECT count(*)::int FROM place_photos WHERE place_id=c.id) AS total
        FROM community_places c WHERE c.id=$1 AND c.archived_at IS NULL`,
      [id],
    );
    if (!result.rows[0]) throw unavailable();
    return result.rows[0].total;
  }

  photo(user: string, id: string, input: PhotoInput) {
    return this.write(user, id, 'ADD_PLACE_PHOTO', async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(720062,hashtext($1))', [
        user + ':' + input.request_key,
      ]);
      const old = await this.photo_by_key(user, input.request_key, tx);
      if (old) {
        if (old.place_id !== id || old.content_hash !== input.content_hash)
          throw new AppError(
            409,
            'PHOTO_REQUEST_CONFLICT',
            'This photo request has changed. Choose the photo again.',
          );
        return { photo: old, reused: true };
      }
      const count = await tx.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM place_photos WHERE place_id=$1',
        [id],
      );
      if (count.rows[0]!.total >= 10)
        throw new AppError(
          422,
          'PLACE_PHOTO_LIMIT',
          'A place can have up to 10 photos.',
        );
      const { rows } = await tx.query<Photo>(
        'INSERT INTO place_photos (id,place_id,author_id,url,public_id,request_key,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          nextEntityId(),
          id,
          user,
          input.url,
          input.public_id,
          input.request_key,
          input.content_hash,
        ],
      );
      return { photo: rows[0]!, reused: false };
    });
  }

  remove_photo(user: string, id: string, photoId: string) {
    return this.write(user, id, 'REMOVE_PLACE_PHOTO', async (tx) => {
      const { rows } = await tx.query<{ public_id: string }>(
        'DELETE FROM place_photos WHERE id=$1 AND place_id=$2 AND author_id=$3 RETURNING public_id',
        [photoId, id, user],
      );
      if (!rows[0])
        throw new AppError(
          404,
          'PLACE_PHOTO_NOT_FOUND',
          'Only your own place photos can be removed.',
        );
      return rows[0].public_id;
    });
  }
}
