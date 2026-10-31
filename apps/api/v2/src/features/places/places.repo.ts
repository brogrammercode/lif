import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { TransactionClient } from '../../infra/database/client.js';
import { require_active_account } from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import {
  place_dedupe_key,
  type PlaceInput,
  type PlaceList,
} from './places.type.js';

const person = {
  id: true,
  first_name: true,
  last_name: true,
  avatar_url: true,
  status: true,
} as const;
const author = (user: { status: string; [key: string]: unknown } | null) => {
  if (!user || user.status !== 'ACTIVE') return { first_name: 'Former member' };
  const { status: _, ...public_user } = user;
  return public_user;
};
const options = { maxWait: 10000, timeout: 15000 };
@Injectable()
export class PlacesRepository {
  constructor(private readonly database: PrismaService) {}
  private relations(user_id: string, detail = false) {
    return {
      photos: {
        select: { id: true, url: true, author_id: true },
        orderBy: { created_at: 'asc' as const },
        take: detail ? 10 : 1,
      },
      visits: {
        select: { user: { select: person }, visited_at: true },
        orderBy: { visited_at: 'desc' as const },
        take: 3,
      },
      saved_places: { where: { user_id }, select: { id: true }, take: 1 },
      _count: { select: { visits: true, reviews: true } },
    };
  }
  private async present(
    rows: Awaited<ReturnType<PlacesRepository['rows']>>,
    user_id: string,
  ) {
    const ids = rows.map((row) => row.id);
    if (!ids.length) return [];
    const [ratings, visits] = await Promise.all([
      this.database.client.placeReview.groupBy({
        by: ['place_id'],
        where: { place_id: { in: ids } },
        _avg: { score: true },
      }),
      this.database.client.placeVisit.findMany({
        where: { place_id: { in: ids }, user_id },
        select: { place_id: true, visited_at: true },
      }),
    ]);
    return rows.map(
      ({ dedupe_key: _, saved_places, _count, visits: recent, ...row }) => ({
        ...row,
        saved: saved_places.length > 0,
        visited_at:
          visits.find((visit) => visit.place_id === row.id)?.visited_at ?? null,
        visitor_count: _count.visits,
        review_count: _count.reviews,
        rating:
          ratings.find((rating) => rating.place_id === row.id)?._avg.score ??
          null,
        visitors: recent.map((visit) => ({
          ...visit,
          user: author(visit.user),
        })),
      }),
    );
  }
  private rows(
    where: Prisma.CommunityPlaceWhereInput,
    user_id: string,
    skip = 0,
    take = 20,
    detail = false,
  ) {
    return this.database.client.communityPlace.findMany({
      where,
      include: this.relations(user_id, detail),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
  }
  async list(user_id: string, input: PlaceList) {
    const where: Prisma.CommunityPlaceWhereInput = {
      ...(input.scope === 'saved'
        ? { saved_places: { some: { user_id } } }
        : {}),
      ...(input.scope === 'visited' ? { visits: { some: { user_id } } } : {}),
      ...(input.type ? { place_type: input.type } : {}),
      ...(input.query
        ? {
            OR: [
              { name: { contains: input.query, mode: 'insensitive' } },
              { address: { contains: input.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.rows(
        where,
        user_id,
        (input.page - 1) * input.page_size,
        input.page_size,
      ),
      this.database.client.communityPlace.count({ where }),
    ]);
    return {
      rows: await this.present(rows, user_id),
      total,
      page: input.page,
      page_size: input.page_size,
    };
  }
  async detail(user_id: string, id: string) {
    const rows = await this.rows({ id }, user_id, 0, 1, true);
    if (!rows.length)
      throw new AppError(
        404,
        'PLACE_NOT_FOUND',
        'This place is no longer available.',
      );
    const [presented, own_review] = await Promise.all([
      this.present(rows, user_id),
      this.database.client.placeReview.findUnique({
        where: { place_id_user_id: { place_id: id, user_id } },
        select: { id: true, score: true, comment: true, updated_at: true },
      }),
    ]);
    return { ...presented[0]!, own_review };
  }
  async reviews(id: string, page: number) {
    const where = { place_id: id };
    const [rows, total] = await Promise.all([
      this.database.client.placeReview.findMany({
        where,
        include: { user: { select: person } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.database.client.placeReview.count({ where }),
    ]);
    return {
      rows: rows.map(({ user, ...row }) => ({ ...row, user: author(user) })),
      total,
      page,
      page_size: 20,
    };
  }
  async create(user_id: string, input: PlaceInput) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_account(tx, user_id);
      const key = place_dedupe_key(input);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720061, hashtext(${key}))`;
      const place = await tx.communityPlace.upsert({
        where: { dedupe_key: key },
        create: { ...input, dedupe_key: key, created_by_id: user_id },
        update: {},
      });
      await tx.savedPlace.upsert({
        where: {
          user_id_community_place_id: { user_id, community_place_id: place.id },
        },
        create: {
          user_id,
          community_place_id: place.id,
          label: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
          place_type: place.place_type,
        },
        update: {},
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'CommunityPlace',
        entity_id: place.id,
        action: 'SAVE_SHARED_PLACE',
      });
      return { id: place.id };
    }, options);
  }
  private async write<T>(
    user_id: string,
    id: string,
    action: string,
    change: (tx: TransactionClient) => Promise<T>,
  ) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_account(tx, user_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720061, hashtext(${id}))`;
      if (
        !(await tx.communityPlace.findUnique({
          where: { id },
          select: { id: true },
        }))
      )
        throw new AppError(
          404,
          'PLACE_NOT_FOUND',
          'This place is no longer available.',
        );
      const result = await change(tx);
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'CommunityPlace',
        entity_id: id,
        action,
      });
      return result;
    }, options);
  }
  async update(
    user_id: string,
    id: string,
    input: PlaceInput & { version: number },
  ) {
    return this.write(user_id, id, 'EDIT_SHARED_PLACE', async (tx) => {
      const { version, ...data } = input;
      const key = place_dedupe_key(data);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720061, hashtext(${key}))`;
      const duplicate = await tx.communityPlace.findUnique({
        where: { dedupe_key: key },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== id)
        throw new AppError(
          409,
          'PLACE_ALREADY_EXISTS',
          'This place already exists. Save the existing place instead.',
        );
      const result = await tx.communityPlace.updateMany({
        where: { id, created_by_id: user_id, version },
        data: {
          ...data,
          dedupe_key: key,
          version: { increment: 1 },
        },
      });
      if (!result.count)
        throw new AppError(
          409,
          'PLACE_CHANGED',
          'Only the contributor can edit this place. Refresh before trying again.',
        );
      await tx.savedPlace.updateMany({
        where: { community_place_id: id },
        data: {
          label: data.name,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          place_type: data.place_type,
        },
      });
      return { id };
    });
  }
  async bookmark(user_id: string, id: string, value: boolean) {
    return this.write(
      user_id,
      id,
      value ? 'SAVE_SHARED_PLACE' : 'UNSAVE_SHARED_PLACE',
      async (tx) => {
        if (!value)
          await tx.savedPlace.deleteMany({
            where: { user_id, community_place_id: id },
          });
        else {
          const place = await tx.communityPlace.findUniqueOrThrow({
            where: { id },
          });
          await tx.savedPlace.upsert({
            where: {
              user_id_community_place_id: { user_id, community_place_id: id },
            },
            update: {},
            create: {
              user_id,
              community_place_id: id,
              label: place.name,
              address: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
              place_type: place.place_type,
            },
          });
        }
        return { saved: value };
      },
    );
  }
  async visit(user_id: string, id: string, value: boolean) {
    return this.write(
      user_id,
      id,
      value ? 'MARK_PLACE_VISITED' : 'CLEAR_PLACE_VISIT',
      async (tx) => {
        if (!value)
          await tx.placeVisit.deleteMany({ where: { place_id: id, user_id } });
        else
          await tx.placeVisit.upsert({
            where: { place_id_user_id: { place_id: id, user_id } },
            create: { place_id: id, user_id },
            update: {},
          });
        return { visited: value };
      },
    );
  }
  async review(
    user_id: string,
    id: string,
    input: { score: number; comment: string } | null,
  ) {
    return this.write(
      user_id,
      id,
      input ? 'REVIEW_PLACE' : 'REMOVE_PLACE_REVIEW',
      async (tx) => {
        if (!input) {
          await tx.placeReview.deleteMany({ where: { place_id: id, user_id } });
          return { removed: true };
        }
        return tx.placeReview.upsert({
          where: { place_id_user_id: { place_id: id, user_id } },
          create: { ...input, place_id: id, user_id },
          update: input,
          select: { id: true },
        });
      },
    );
  }
  photo_by_key(user_id: string, key: string) {
    return this.database.client.placePhoto.findUnique({
      where: {
        author_id_request_key: { author_id: user_id, request_key: key },
      },
    });
  }
  async photo_capacity(id: string) {
    const place = await this.database.client.communityPlace.findUnique({
      where: { id },
      select: { _count: { select: { photos: true } } },
    });
    if (!place)
      throw new AppError(
        404,
        'PLACE_NOT_FOUND',
        'This place is no longer available.',
      );
    return place._count.photos;
  }
  async photo(
    user_id: string,
    id: string,
    input: {
      request_key: string;
      content_hash: string;
      url: string;
      public_id: string;
    },
  ) {
    return this.write(user_id, id, 'ADD_PLACE_PHOTO', async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720062, hashtext(${user_id + ':' + input.request_key}))`;
      const old = await tx.placePhoto.findUnique({
        where: {
          author_id_request_key: {
            author_id: user_id,
            request_key: input.request_key,
          },
        },
      });
      if (old) {
        if (old.place_id !== id || old.content_hash !== input.content_hash)
          throw new AppError(
            409,
            'PHOTO_REQUEST_CONFLICT',
            'This photo request has changed. Choose the photo again.',
          );
        return { photo: old, reused: true };
      }
      if ((await tx.placePhoto.count({ where: { place_id: id } })) >= 10)
        throw new AppError(
          422,
          'PLACE_PHOTO_LIMIT',
          'A place can have up to 10 photos.',
        );
      return {
        photo: await tx.placePhoto.create({
          data: { ...input, place_id: id, author_id: user_id },
        }),
        reused: false,
      };
    });
  }
  async remove_photo(user_id: string, id: string, photo_id: string) {
    return this.write(user_id, id, 'REMOVE_PLACE_PHOTO', async (tx) => {
      const photo = await tx.placePhoto.findFirst({
        where: { id: photo_id, place_id: id, author_id: user_id },
      });
      if (!photo)
        throw new AppError(
          404,
          'PLACE_PHOTO_NOT_FOUND',
          'Only your own place photos can be removed.',
        );
      await tx.placePhoto.delete({ where: { id: photo.id } });
      return photo.public_id;
    });
  }
}
