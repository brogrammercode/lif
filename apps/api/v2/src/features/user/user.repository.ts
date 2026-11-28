import { Injectable } from '@nestjs/common';
import { AppError } from '../../core/error.js';
import { NOT_FOUND_ERROR_MESSAGE } from '../../core/constants.js';
import { nextEntityId } from '../../database/entity-id.js';
import { PostgresService } from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { visibleNotificationExcludedTitles } from '../../infra/mail/new_user_email.js';
import type {
  LocationUpdateInput,
  ProfileUpdateInput,
  SavedPlaceInput,
} from './dto/user.dto.js';
import { userSql } from './sql/user.sql.js';

type AuditRow = { id: string; [key: string]: unknown };
const placeValues = (input: SavedPlaceInput) => [
  input.label,
  input.address,
  input.latitude,
  input.longitude,
  input.place_type,
  JSON.stringify(input.place_data),
];

@Injectable()
export class UserRepository {
  constructor(private readonly db: PostgresService) {}

  update_profile(userId: string, input: ProfileUpdateInput, actorId: string) {
    return this.db.transaction(async (tx) => {
      const before = (await tx.query<AuditRow>(userSql.lockProfile, [userId]))
        .rows[0];
      if (!before)
        throw new AppError(404, 'NOT_FOUND', NOT_FOUND_ERROR_MESSAGE);
      const values = [
        input.first_name,
        input.last_name,
        input.phone_e164,
        input.avatar_url,
      ];
      const after = values.every((value) => value === undefined)
        ? before
        : (await tx.query<AuditRow>(userSql.profile, [userId, ...values]))
            .rows[0]!;
      await insertUserLog(tx, {
        actor_id: actorId,
        entity_type: 'User',
        entity_id: userId,
        action: 'UPDATE_PROFILE',
        before_data: before,
        after_data: after,
      });
      return after;
    });
  }

  update_last_known_location(userId: string, input: LocationUpdateInput) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query(userSql.location, [
        userId,
        input.latitude,
        input.longitude,
      ]);
      if (!rows[0]) return null;
      await insertUserLog(tx, {
        actor_id: userId,
        entity_type: 'User',
        entity_id: userId,
        action: 'UPDATE_LAST_KNOWN_LOCATION',
      });
      return rows[0];
    });
  }

  async list_saved_places(userId: string) {
    return (await this.db.query(userSql.places, [userId])).rows;
  }

  create_saved_place(userId: string, input: SavedPlaceInput, actorId: string) {
    return this.db.transaction(async (tx) => {
      const id = nextEntityId();
      const { rows } = await tx.query<AuditRow>(userSql.createPlace, [
        id,
        userId,
        ...placeValues(input),
      ]);
      await insertUserLog(tx, {
        actor_id: actorId,
        entity_type: 'SavedPlace',
        entity_id: id,
        action: 'CREATE_SAVED_PLACE',
        after_data: rows[0],
      });
      return rows[0]!;
    });
  }

  update_saved_place(
    userId: string,
    id: string,
    input: SavedPlaceInput,
    actorId: string,
  ) {
    return this.db.transaction(async (tx) => {
      const before = (await tx.query(userSql.lockPlace, [id, userId])).rows[0];
      if (!before) return null;
      const after = (
        await tx.query(userSql.updatePlace, [id, userId, ...placeValues(input)])
      ).rows[0]!;
      await insertUserLog(tx, {
        actor_id: actorId,
        entity_type: 'SavedPlace',
        entity_id: id,
        action: 'UPDATE_SAVED_PLACE',
        before_data: before,
        after_data: after,
      });
      return after;
    });
  }

  delete_saved_place(userId: string, id: string, actorId: string) {
    return this.db.transaction(async (tx) => {
      const before = (await tx.query(userSql.deletePlace, [id, userId]))
        .rows[0];
      if (!before) return false;
      await insertUserLog(tx, {
        actor_id: actorId,
        entity_type: 'SavedPlace',
        entity_id: id,
        action: 'DELETE_SAVED_PLACE',
        before_data: before,
      });
      return true;
    });
  }

  async list_notifications(userId: string) {
    return (
      await this.db.query(userSql.notifications, [
        userId,
        visibleNotificationExcludedTitles,
      ])
    ).rows;
  }

  mark_notification_read(userId: string, id: string, actorId: string) {
    return this.db.transaction(async (tx) => {
      const values = [id, userId, visibleNotificationExcludedTitles];
      const before = (await tx.query(userSql.lockNotification, values)).rows[0];
      if (!before) return null;
      const after = (await tx.query(userSql.readNotification, values)).rows[0]!;
      await insertUserLog(tx, {
        actor_id: actorId,
        entity_type: 'Notification',
        entity_id: id,
        action: 'MARK_NOTIFICATION_READ',
        before_data: before,
        after_data: after,
      });
      return after;
    });
  }
}
