import { approved_driver_upi } from '../driver_operations/driver_payout.js';
import { trip_distance_m } from '../driver_operations/trip.rules.js';
import {
  require_active_account,
  require_driver_participation,
} from '../../infra/database/account_lifecycle.js';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import { CATEGORY_MESSAGES } from '../vehicle_category/vehicle_category.constant.js';
import {
  is_vehicle_eligible,
  MATCHING_VEHICLE_INCLUDE,
} from '../vehicle_category/vehicle_category.security.js';
import {
  DRIVER_ON_TRIP_MESSAGE,
  VEHICLE_NOT_FOUND_MESSAGE,
  VEHICLE_NOT_READY_MESSAGE,
  VEHICLE_CAPACITY_MESSAGE,
  DRIVER_PROFILE_EXISTS_MESSAGE,
  OFFER_NOT_AVAILABLE_MESSAGE,
  DRIVER_NOT_VERIFIED_MESSAGE,
} from './driver.constant.js';
import type {
  AvailabilityInput,
  DriverProfileInput,
  LocationInput,
  VehicleInput,
} from './driver.type.js';
@Injectable()
export class DriverRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly get_profile_by_user = async (user_id: string) =>
    this.prismaService.client.driverProfile.findUnique({
      where: { user_id },
      include: {
        user: true,
        vehicles: {
          include: { vehicle_category: { include: { parent: true } } },
        },
        documents: true,
        active_vehicle: true,
      },
    });

  readonly create_driver_profile = async (
    user_id: string,
    input: DriverProfileInput,
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
        await require_driver_participation(tx, user_id);
        const applicant = await tx.user.findUnique({
          where: { id: user_id },
          select: { role: true, partner_activated_at: true },
        });
        if (!applicant?.partner_activated_at && applicant?.role !== 'DRIVER')
          throw new AppError(
            403,
            'PARTNER_ACTIVATION_REQUIRED',
            'Complete Partner Program approval and activation before registering as a driver.',
          );
        const existing = await tx.driverProfile.findUnique({
          where: { user_id },
          select: { id: true },
        });
        if (existing)
          throw new AppError(
            409,
            'DRIVER_PROFILE_EXISTS',
            DRIVER_PROFILE_EXISTS_MESSAGE,
          );
        const profile = await tx.driverProfile.create({
          data: { user_id, license_number: input.license_number },
        });
        await tx.user.updateMany({
          where: { id: user_id, role: 'RIDER' },
          data: { role: 'DRIVER' },
        });
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'DriverProfile',
          entity_id: profile.id,
          action: 'CREATE_DRIVER_PROFILE',
          after_data: profile as unknown as Prisma.InputJsonObject,
        });
        return tx.driverProfile.findUnique({
          where: { id: profile.id },
          include: {
            user: true,
            vehicles: { include: MATCHING_VEHICLE_INCLUDE },
            documents: true,
            active_vehicle: true,
          },
        });
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly set_availability = async (
    user_id: string,
    input: AvailabilityInput,
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720054, hashtext(${user_id}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
        await require_driver_participation(tx, user_id);
        const profile = await tx.driverProfile.findUnique({
          where: { user_id },
          include: {
            user: { select: { status: true } },
            active_vehicle: { include: MATCHING_VEHICLE_INCLUDE },
          },
        });
        if (!profile) return null;
        if (profile.availability === 'SUSPENDED') {
          if (input.availability === 'OFFLINE') return profile;
          throw new AppError(
            403,
            'DRIVER_SUSPENDED',
            'Driver access is suspended. Contact support before going online.',
          );
        }
        if (
          profile.user.status !== 'ACTIVE' ||
          (input.availability === 'AVAILABLE' &&
            profile.verification_status !== 'VERIFIED')
        )
          throw new AppError(
            403,
            'DRIVER_NOT_VERIFIED',
            DRIVER_NOT_VERIFIED_MESSAGE,
          );
        if (input.availability === 'AVAILABLE') {
          const rules = await tx.rideFarePolicy.findUnique({
            where: { key: 'default' },
            select: { location_max_age_s: true, arrival_radius_m: true },
          });
          if (
            !profile.last_location_at ||
            Date.now() - profile.last_location_at.getTime() >
              (rules?.location_max_age_s ?? 60) * 1000 ||
            profile.last_location_accuracy_m === null ||
            profile.last_location_accuracy_m > (rules?.arrival_radius_m ?? 150)
          )
            throw new AppError(
              409,
              'FRESH_LOCATION_REQUIRED',
              'Enable precise GPS and refresh your location before going online.',
            );
        }
        const category = profile.active_vehicle?.vehicle_category;
        if (
          input.availability === 'AVAILABLE' &&
          (!category ||
            !is_vehicle_eligible(
              profile.active_vehicle,
              {
                vehicle_category_id: category.id,
                vehicle_type: category.vehicle_type,
                category_snapshot: null,
              },
              profile.id,
            ))
        )
          throw new AppError(
            409,
            'VEHICLE_NOT_READY',
            VEHICLE_NOT_READY_MESSAGE,
          );
        const active_ride = await tx.ride.findFirst({
          where: {
            driver_id: profile.id,
            status: {
              in: [
                'DRIVER_ASSIGNED',
                'DRIVER_ARRIVING',
                'DRIVER_WAITING',
                'IN_PROGRESS',
              ],
            },
          },
          select: { id: true },
        });
        if (active_ride)
          throw new AppError(409, 'DRIVER_ON_TRIP', DRIVER_ON_TRIP_MESSAGE);
        if (
          input.availability === 'AVAILABLE' &&
          (await tx.ride.findFirst({
            where: {
              rider_id: user_id,
              status: {
                in: [
                  'REQUESTED',
                  'SEARCHING',
                  'DRIVER_ASSIGNED',
                  'DRIVER_ARRIVING',
                  'DRIVER_WAITING',
                  'IN_PROGRESS',
                ],
              },
            },
            select: { id: true },
          }))
        )
          throw new AppError(
            409,
            'ACTIVE_RIDE_EXISTS',
            'Finish or cancel your rider journey before going online as a driver.',
          );
        const updated = await tx.driverProfile.update({
          where: { id: profile.id },
          data: {
            availability: input.availability,
            current_latitude: input.latitude,
            current_longitude: input.longitude,
            ...(input.latitude !== undefined
              ? { last_location_accuracy_m: null }
              : {}),
            last_location_at:
              input.latitude !== undefined && input.longitude !== undefined
                ? new Date()
                : profile.last_location_at,
          },
        });
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'DriverProfile',
          entity_id: profile.id,
          action: 'UPDATE_DRIVER_AVAILABILITY',
          before_data: {
            availability: profile.availability,
          } as Prisma.InputJsonObject,
          after_data: {
            availability: updated.availability,
          } as Prisma.InputJsonObject,
        });
        return updated;
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly create_vehicle = async (user_id: string, input: VehicleInput) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
        await require_driver_participation(tx, user_id);
        const profile = await tx.driverProfile.findUnique({
          where: { user_id },
        });
        if (!profile) return null;
        const category = input.vehicle_category_id
          ? await tx.vehicleCategory.findUnique({
              where: { id: input.vehicle_category_id },
              include: { parent: true, _count: { select: { children: true } } },
            })
          : await tx.vehicleCategory.findUnique({
              where: { code: input.type! },
              include: { parent: true, _count: { select: { children: true } } },
            });
        if (
          !category ||
          !category.is_active ||
          (category.parent && !category.parent.is_active) ||
          category._count.children > 0
        )
          throw new AppError(
            422,
            'CATEGORY_UNAVAILABLE',
            CATEGORY_MESSAGES.UNAVAILABLE,
          );
        if (input.type && input.type !== category.vehicle_type)
          throw new AppError(
            422,
            'CATEGORY_TYPE_MISMATCH',
            CATEGORY_MESSAGES.TYPE_MISMATCH,
          );
        if (input.capacity !== undefined && input.capacity < category.capacity)
          throw new AppError(
            422,
            'CATEGORY_CAPACITY_MISMATCH',
            VEHICLE_CAPACITY_MESSAGE,
          );
        const vehicle = await tx.vehicle.create({
          data: {
            driver_id: profile.id,
            type: category.vehicle_type,
            vehicle_category_id: category.id,
            make: input.make,
            model: input.model,
            color: input.color,
            plate_number: input.plate_number
              .toUpperCase()
              .replace(/[\s-]+/g, ''),
            capacity: input.capacity ?? category.capacity,
            photo_url: input.photo_url,
          },
        });
        if (!profile.active_vehicle_id)
          await tx.driverProfile.update({
            where: { id: profile.id },
            data: { active_vehicle_id: vehicle.id },
          });
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'Vehicle',
          entity_id: vehicle.id,
          action: 'CREATE_VEHICLE',
          after_data: vehicle as unknown as Prisma.InputJsonObject,
        });
        return vehicle;
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly change_vehicle_category = async (
    user_id: string,
    vehicle_id: string,
    category_id: string,
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
        await require_driver_participation(tx, user_id);
        const vehicle = await tx.vehicle.findFirst({
          where: { id: vehicle_id, driver: { user_id } },
        });
        if (!vehicle)
          throw new AppError(
            404,
            'VEHICLE_NOT_FOUND',
            VEHICLE_NOT_FOUND_MESSAGE,
          );
        if (vehicle.verification_version > 0)
          throw new AppError(
            409,
            'VEHICLE_FIELD_LOCKED',
            'Use the vehicle verification form to request a category correction.',
          );
        const active_ride = await tx.ride.findFirst({
          where: {
            vehicle_id,
            status: {
              in: [
                'DRIVER_ASSIGNED',
                'DRIVER_ARRIVING',
                'DRIVER_WAITING',
                'IN_PROGRESS',
              ],
            },
          },
          select: { id: true },
        });
        if (active_ride)
          throw new AppError(409, 'VEHICLE_ON_TRIP', DRIVER_ON_TRIP_MESSAGE);
        const category = await tx.vehicleCategory.findUnique({
          where: { id: category_id },
          include: { parent: true, _count: { select: { children: true } } },
        });
        if (
          !category ||
          !category.is_active ||
          (category.parent && !category.parent.is_active) ||
          category._count.children > 0
        )
          throw new AppError(
            422,
            'CATEGORY_UNAVAILABLE',
            CATEGORY_MESSAGES.UNAVAILABLE,
          );
        if (
          category.vehicle_type !== vehicle.type ||
          category.capacity > vehicle.capacity
        )
          throw new AppError(
            422,
            'CATEGORY_TYPE_MISMATCH',
            CATEGORY_MESSAGES.TYPE_MISMATCH,
          );
        const updated = await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { vehicle_category_id: category.id },
          include: { vehicle_category: true },
        });
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'Vehicle',
          entity_id: vehicle.id,
          action: 'CHANGE_VEHICLE_CATEGORY',
          before_data: { vehicle_category_id: vehicle.vehicle_category_id },
          after_data: { vehicle_category_id: category.id },
        });
        return updated;
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly select_active_vehicle = async (
    user_id: string,
    vehicle_id: string,
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
        await require_driver_participation(tx, user_id);
        const vehicle = await tx.vehicle.findFirst({
          where: {
            id: vehicle_id,
            driver: { user_id, user: { status: 'ACTIVE' } },
          },
          include: MATCHING_VEHICLE_INCLUDE,
        });
        if (!vehicle)
          throw new AppError(
            404,
            'VEHICLE_NOT_FOUND',
            VEHICLE_NOT_FOUND_MESSAGE,
          );
        const category = vehicle.vehicle_category;
        if (
          !category ||
          !is_vehicle_eligible(
            vehicle,
            {
              vehicle_category_id: category.id,
              vehicle_type: category.vehicle_type,
              category_snapshot: null,
            },
            vehicle.driver_id,
          )
        )
          throw new AppError(
            409,
            'VEHICLE_NOT_READY',
            VEHICLE_NOT_READY_MESSAGE,
          );
        const before = await tx.driverProfile.findUniqueOrThrow({
          where: { id: vehicle.driver_id },
        });
        if (
          await tx.ride.count({
            where: {
              driver_id: vehicle.driver_id,
              status: {
                in: [
                  'DRIVER_ASSIGNED',
                  'DRIVER_ARRIVING',
                  'DRIVER_WAITING',
                  'IN_PROGRESS',
                ],
              },
            },
          })
        )
          throw new AppError(409, 'DRIVER_ON_TRIP', DRIVER_ON_TRIP_MESSAGE);
        const updated = await tx.driverProfile.update({
          where: { id: vehicle.driver_id },
          data: { active_vehicle_id: vehicle.id },
        });
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'DriverProfile',
          entity_id: vehicle.driver_id,
          action: 'SELECT_ACTIVE_VEHICLE',
          before_data: { active_vehicle_id: before.active_vehicle_id },
          after_data: { active_vehicle_id: vehicle.id },
        });
        return updated;
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly accept_offer = async (user_id: string, offer_id: string) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720054, hashtext(${user_id}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
        const initial_offer = await tx.rideOffer.findFirst({
          where: { id: offer_id, driver: { user_id } },
          select: { ride_id: true },
        });
        if (!initial_offer) return { kind: 'not_found' as const };
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${initial_offer.ride_id}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
        await require_driver_participation(tx, user_id);
        const profile = await tx.driverProfile.findUnique({
          where: { user_id },
          include: {
            user: { select: { status: true } },
            active_vehicle: { include: MATCHING_VEHICLE_INCLUDE },
          },
        });
        const offer = await tx.rideOffer.findFirst({
          where: { id: offer_id, driver: { user_id } },
          include: {
            ride: {
              include: { quotes: { where: { selected_at: { not: null } } } },
            },
          },
        });
        if (!profile || !offer) return { kind: 'not_found' as const };
        if (
          offer.status === 'ACCEPTED' &&
          offer.ride.driver_id === profile.id &&
          [
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_WAITING',
            'IN_PROGRESS',
          ].includes(offer.ride.status)
        )
          return { kind: 'success' as const, ride_id: offer.ride_id };
        if (
          await tx.ride.findFirst({
            where: {
              rider_id: user_id,
              status: {
                in: [
                  'REQUESTED',
                  'SEARCHING',
                  'DRIVER_ASSIGNED',
                  'DRIVER_ARRIVING',
                  'DRIVER_WAITING',
                  'IN_PROGRESS',
                ],
              },
            },
            select: { id: true },
          })
        ) {
          return { kind: 'not_available' as const };
        }
        if (
          offer.status !== 'SENT' ||
          offer.expires_at.getTime() <= Date.now() ||
          offer.ride.status !== 'SEARCHING' ||
          !profile.active_vehicle_id
        )
          return { kind: 'not_available' as const };
        const rules = await tx.rideFarePolicy.findUnique({
          where: { key: 'default' },
          select: {
            location_max_age_s: true,
            arrival_radius_m: true,
            matching_max_radius_km: true,
            search_timeout_s: true,
          },
        });
        if (
          !profile.current_latitude ||
          !profile.current_longitude ||
          !profile.last_location_at ||
          Date.now() - profile.last_location_at.getTime() >
            (rules?.location_max_age_s ?? 60) * 1000 ||
          profile.last_location_accuracy_m === null ||
          profile.last_location_accuracy_m > (rules?.arrival_radius_m ?? 150)
        )
          return { kind: 'not_available' as const };
        if (
          (Date.now() -
            (offer.ride.requested_at ?? offer.ride.created_at).getTime()) /
            1000 >=
            (rules?.search_timeout_s ?? 180) ||
          trip_distance_m(
            profile.current_latitude.toNumber(),
            profile.current_longitude.toNumber(),
            offer.ride.pickup_latitude.toNumber(),
            offer.ride.pickup_longitude.toNumber(),
          ) >
            (offer.ride.search_radius_km ??
              rules?.matching_max_radius_km ??
              10) *
              1000
        )
          return { kind: 'not_available' as const };
        if (
          offer.ride.collection_preference === 'UPI' &&
          !(await approved_driver_upi(tx, user_id))
        )
          return { kind: 'not_available' as const };
        const selected_quote = offer.ride.quotes[0];
        if (
          profile.user.status !== 'ACTIVE' ||
          profile.verification_status !== 'VERIFIED' ||
          profile.availability !== 'AVAILABLE' ||
          !is_vehicle_eligible(
            profile.active_vehicle,
            selected_quote,
            profile.id,
          )
        )
          return { kind: 'not_available' as const };
        if (
          await tx.ride.count({
            where: {
              driver_id: profile.id,
              status: {
                in: [
                  'DRIVER_ASSIGNED',
                  'DRIVER_ARRIVING',
                  'DRIVER_WAITING',
                  'IN_PROGRESS',
                ],
              },
            },
          })
        )
          return { kind: 'not_available' as const };
        const updated_ride = await tx.ride.updateMany({
          where: { id: offer.ride_id, status: 'SEARCHING', driver_id: null },
          data: {
            status: 'DRIVER_ASSIGNED',
            driver_id: profile.id,
            vehicle_id: profile.active_vehicle_id,
            matched_at: new Date(),
          },
        });
        if (updated_ride.count !== 1) return { kind: 'not_available' as const };
        await tx.rideOffer.update({
          where: { id: offer.id },
          data: { status: 'ACCEPTED', responded_at: new Date() },
        });
        await tx.rideOffer.updateMany({
          where: {
            ride_id: offer.ride_id,
            id: { not: offer.id },
            status: 'SENT',
          },
          data: { status: 'CANCELLED', responded_at: new Date() },
        });
        await tx.driverProfile.update({
          where: { id: profile.id },
          data: { availability: 'EN_ROUTE' },
        });
        await tx.rideEvent.create({
          data: {
            ride_id: offer.ride_id,
            actor_id: user_id,
            event_type: 'DRIVER_ACCEPTED',
          },
        });
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'Ride',
          entity_id: offer.ride_id,
          action: 'ACCEPT_RIDE_OFFER',
          after_data: {
            driver_id: profile.id,
            vehicle_id: profile.active_vehicle_id,
          } as Prisma.InputJsonObject,
        });
        return { kind: 'success' as const, ride_id: offer.ride_id };
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly reject_offer = async (user_id: string, offer_id: string) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
        await require_driver_participation(tx, user_id);
        const offer = await tx.rideOffer.findFirst({
          where: { id: offer_id, driver: { user_id } },
        });
        if (!offer) return false;
        const changed = await tx.rideOffer.updateMany({
          where: {
            id: offer_id,
            status: 'SENT',
            expires_at: { gt: new Date() },
            ride: { status: 'SEARCHING' },
          },
          data: { status: 'REJECTED', responded_at: new Date() },
        });
        if (changed.count !== 1)
          throw new AppError(
            409,
            'OFFER_NOT_AVAILABLE',
            OFFER_NOT_AVAILABLE_MESSAGE,
          );
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'RideOffer',
          entity_id: offer_id,
          action: 'REJECT_RIDE_OFFER',
        });
        return true;
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly record_location = async (user_id: string, input: LocationInput) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
        await require_driver_participation(tx, user_id);
        const profile = await tx.driverProfile.findUnique({
          where: { user_id },
        });
        if (!profile) return null;
        const fix_at = input.captured_at
          ? new Date(input.captured_at)
          : new Date();
        if (
          fix_at.getTime() > Date.now() + 5000 ||
          fix_at.getTime() < Date.now() - 300000
        )
          throw new AppError(
            422,
            'LOCATION_TIMESTAMP_INVALID',
            'Use a recent GPS location.',
          );
        if (profile.last_location_at && fix_at < profile.last_location_at)
          return profile;
        const updated = await tx.driverProfile.update({
          where: { id: profile.id },
          data: {
            current_latitude: input.latitude,
            current_longitude: input.longitude,
            last_location_at: fix_at,
            last_location_accuracy_m: input.accuracy_m ?? null,
          },
        });
        const active_ride = await tx.ride.findFirst({
          where: {
            driver_id: profile.id,
            status: {
              in: [
                'DRIVER_ASSIGNED',
                'DRIVER_ARRIVING',
                'DRIVER_WAITING',
                'IN_PROGRESS',
              ],
            },
          },
          orderBy: { created_at: 'desc' },
        });
        if (active_ride) {
          await tx.rideLocation.create({
            data: {
              ride_id: active_ride.id,
              driver_id: profile.id,
              latitude: input.latitude,
              longitude: input.longitude,
              heading: input.heading,
              speed_kph: input.speed_kph,
              recorded_at: fix_at,
            },
          });
        }
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'DriverProfile',
          entity_id: profile.id,
          action: 'UPDATE_DRIVER_LOCATION',
        });
        return updated;
      },
      { maxWait: 10000, timeout: 15000 },
    );
}
