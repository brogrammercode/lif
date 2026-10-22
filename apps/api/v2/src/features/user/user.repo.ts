import { Injectable } from '@nestjs/common';
import { visible_notification_filter } from '../../infra/mail/new_user_email.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { create_user_log } from '../../infra/database/user_log.js';
import type {
  LocationUpdateInput,
  ProfileUpdateInput,
  SavedPlaceInput,
} from './user.type.js';
@Injectable()
export class UserRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly update_profile = async (
    user_id: string,
    input: ProfileUpdateInput,
    actor_uid: string,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: user_id } });
      const user = await tx.user.update({
        where: { id: user_id },
        data: input,
      });
      await create_user_log(tx, {
        actor_id: actor_uid,
        entity_type: 'User',
        entity_id: user_id,
        action: 'UPDATE_PROFILE',
        before_data: before as unknown as Prisma.InputJsonObject,
        after_data: user as unknown as Prisma.InputJsonObject,
      });
      return user;
    });

  readonly update_last_known_location = async (
    user_id: string,
    input: LocationUpdateInput,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: user_id },
        select: { id: true },
      });
      if (!before) return null;
      const user = await tx.user.update({
        where: { id: user_id },
        data: {
          last_known_latitude: input.latitude,
          last_known_longitude: input.longitude,
        },
        select: {
          id: true,
          last_known_latitude: true,
          last_known_longitude: true,
        },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'User',
        entity_id: user_id,
        action: 'UPDATE_LAST_KNOWN_LOCATION',
      });
      return user;
    });

  readonly list_saved_places = async (user_id: string) =>
    this.prismaService.client.savedPlace.findMany({
      where: { user_id },
      orderBy: { created_at: 'desc' },
    });

  readonly create_saved_place = async (
    user_id: string,
    input: SavedPlaceInput,
    actor_uid: string,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const saved_place = await tx.savedPlace.create({
        data: {
          user_id,
          label: input.label,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          place_type: input.place_type,
          place_data: input.place_data as Prisma.InputJsonValue | undefined,
        },
      });
      await create_user_log(tx, {
        actor_id: actor_uid,
        entity_type: 'SavedPlace',
        entity_id: saved_place.id,
        action: 'CREATE_SAVED_PLACE',
        after_data: saved_place as unknown as Prisma.InputJsonObject,
      });
      return saved_place;
    });

  readonly update_saved_place = async (
    user_id: string,
    saved_place_id: string,
    input: SavedPlaceInput,
    actor_uid: string,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const before = await tx.savedPlace.findFirst({
        where: { id: saved_place_id, user_id },
      });
      if (!before) return null;
      const saved_place = await tx.savedPlace.update({
        where: { id: saved_place_id },
        data: {
          label: input.label,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          place_type: input.place_type,
          place_data: input.place_data as Prisma.InputJsonValue | undefined,
        },
      });
      await create_user_log(tx, {
        actor_id: actor_uid,
        entity_type: 'SavedPlace',
        entity_id: saved_place_id,
        action: 'UPDATE_SAVED_PLACE',
        before_data: before as unknown as Prisma.InputJsonObject,
        after_data: saved_place as unknown as Prisma.InputJsonObject,
      });
      return saved_place;
    });

  readonly delete_saved_place = async (
    user_id: string,
    saved_place_id: string,
    actor_uid: string,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const before = await tx.savedPlace.findFirst({
        where: { id: saved_place_id, user_id },
      });
      if (!before) return false;
      await tx.savedPlace.delete({ where: { id: saved_place_id } });
      await create_user_log(tx, {
        actor_id: actor_uid,
        entity_type: 'SavedPlace',
        entity_id: saved_place_id,
        action: 'DELETE_SAVED_PLACE',
        before_data: before as unknown as Prisma.InputJsonObject,
      });
      return true;
    });

  readonly list_notifications = async (user_id: string) =>
    this.prismaService.client.notification.findMany({
      where: { user_id, ...visible_notification_filter },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

  readonly mark_notification_read = async (
    user_id: string,
    notification_id: string,
    actor_uid: string,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const notification = await tx.notification.findFirst({
        where: { id: notification_id, user_id, ...visible_notification_filter },
      });
      if (!notification) return null;
      const updated = await tx.notification.update({
        where: { id: notification_id },
        data: { read_at: new Date() },
      });
      await create_user_log(tx, {
        actor_id: actor_uid,
        entity_type: 'Notification',
        entity_id: notification_id,
        action: 'MARK_NOTIFICATION_READ',
        before_data: notification as unknown as Prisma.InputJsonObject,
        after_data: updated as unknown as Prisma.InputJsonObject,
      });
      return updated;
    });
}
