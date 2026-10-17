import { Prisma } from '@prisma/client';
import { prisma } from '../../infra/database/client.js';
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

export const get_profile_by_user = async (user_id: string) =>
  prisma.driverProfile.findUnique({
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

export const create_driver_profile = async (
  user_id: string,
  input: DriverProfileInput,
) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
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
      await tx.user.update({
        where: { id: user_id },
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
    { maxWait: 10_000, timeout: 15_000 },
  );

export const set_availability = async (
  user_id: string,
  input: AvailabilityInput,
) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
      const profile = await tx.driverProfile.findUnique({
        where: { user_id },
        include: {
          user: { select: { status: true } },
          active_vehicle: { include: MATCHING_VEHICLE_INCLUDE },
        },
      });
      if (!profile) return null;
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
        throw new AppError(409, 'VEHICLE_NOT_READY', VEHICLE_NOT_READY_MESSAGE);
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
      const updated = await tx.driverProfile.update({
        where: { id: profile.id },
        data: {
          availability: input.availability,
          current_latitude: input.latitude,
          current_longitude: input.longitude,
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
    { maxWait: 10_000, timeout: 15_000 },
  );

export const create_vehicle = async (user_id: string, input: VehicleInput) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
      const profile = await tx.driverProfile.findUnique({ where: { user_id } });
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
          plate_number: input.plate_number.toUpperCase(),
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
    { maxWait: 10_000, timeout: 15_000 },
  );

export const change_vehicle_category = async (
  user_id: string,
  vehicle_id: string,
  category_id: string,
) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicle_id, driver: { user_id } },
      });
      if (!vehicle)
        throw new AppError(404, 'VEHICLE_NOT_FOUND', VEHICLE_NOT_FOUND_MESSAGE);
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
    { maxWait: 10_000, timeout: 15_000 },
  );

export const select_active_vehicle = async (
  user_id: string,
  vehicle_id: string,
) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
      const vehicle = await tx.vehicle.findFirst({
        where: {
          id: vehicle_id,
          driver: { user_id, user: { status: 'ACTIVE' } },
        },
        include: MATCHING_VEHICLE_INCLUDE,
      });
      if (!vehicle)
        throw new AppError(404, 'VEHICLE_NOT_FOUND', VEHICLE_NOT_FOUND_MESSAGE);
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
        throw new AppError(409, 'VEHICLE_NOT_READY', VEHICLE_NOT_READY_MESSAGE);
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
    { maxWait: 10_000, timeout: 15_000 },
  );

export const list_offers = async (user_id: string) =>
  prisma.rideOffer.findMany({
    where: {
      driver: { user_id },
      status: 'SENT',
      expires_at: { gt: new Date() },
      ride: { status: 'SEARCHING' },
    },
    orderBy: { sent_at: 'desc' },
    include: { ride: { include: { quotes: true, route: true } } },
  });

export const accept_offer = async (user_id: string, offer_id: string) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      const initial_offer = await tx.rideOffer.findFirst({
        where: { id: offer_id, driver: { user_id } },
        select: { ride_id: true },
      });
      if (!initial_offer) return { kind: 'not_found' as const };
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${initial_offer.ride_id}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
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
        offer.status !== 'SENT' ||
        offer.expires_at.getTime() <= Date.now() ||
        offer.ride.status !== 'SEARCHING' ||
        !profile.active_vehicle_id
      )
        return { kind: 'not_available' as const };
      const selected_quote = offer.ride.quotes[0];
      if (
        profile.user.status !== 'ACTIVE' ||
        profile.verification_status !== 'VERIFIED' ||
        profile.availability !== 'AVAILABLE' ||
        !is_vehicle_eligible(profile.active_vehicle, selected_quote, profile.id)
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
    { maxWait: 10_000, timeout: 15_000 },
  );

export const reject_offer = async (user_id: string, offer_id: string) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
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
    { maxWait: 10_000, timeout: 15_000 },
  );

export const record_location = async (user_id: string, input: LocationInput) =>
  prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.findUnique({ where: { user_id } });
    if (!profile) return null;
    const updated = await tx.driverProfile.update({
      where: { id: profile.id },
      data: {
        current_latitude: input.latitude,
        current_longitude: input.longitude,
        last_location_at: new Date(),
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
        },
      });
    }
    return updated;
  });

export const transition_ride = async (
  user_id: string,
  ride_id: string,
  target: 'DRIVER_WAITING' | 'IN_PROGRESS' | 'COMPLETED',
) =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${ride_id}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
      const profile = await tx.driverProfile.findUnique({ where: { user_id } });
      if (!profile) return { kind: 'not_found' as const };
      const ride = await tx.ride.findFirst({
        where: { id: ride_id, driver_id: profile.id },
      });
      if (!profile || !ride) return { kind: 'not_found' as const };
      const transitions = {
        DRIVER_WAITING: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING'],
        IN_PROGRESS: ['DRIVER_WAITING'],
        COMPLETED: ['IN_PROGRESS'],
      } as const;
      if (!(transitions[target] as readonly string[]).includes(ride.status))
        return { kind: 'invalid_state' as const };
      const event_type =
        target === 'DRIVER_WAITING'
          ? 'DRIVER_WAITING'
          : target === 'IN_PROGRESS'
            ? 'TRIP_STARTED'
            : 'TRIP_COMPLETED';
      const updated = await tx.ride.update({
        where: { id: ride_id },
        data:
          target === 'DRIVER_WAITING'
            ? { status: target, arrived_at: new Date() }
            : target === 'IN_PROGRESS'
              ? { status: target, started_at: new Date() }
              : {
                  status: target,
                  completed_at: new Date(),
                  final_fare: ride.estimated_fare,
                  actual_distance_m: ride.estimated_distance_m,
                  actual_duration_s: ride.estimated_duration_s,
                },
      });
      await tx.rideEvent.create({
        data: { ride_id, actor_id: user_id, event_type },
      });
      if (target === 'COMPLETED') {
        await tx.driverProfile.update({
          where: { id: profile.id },
          data: {
            availability: 'AVAILABLE',
            completed_rides: { increment: 1 },
          },
        });
      } else if (target === 'IN_PROGRESS') {
        await tx.driverProfile.update({
          where: { id: profile.id },
          data: { availability: 'ON_TRIP' },
        });
      }
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Ride',
        entity_id: ride_id,
        action: `DRIVER_${target}`,
        before_data: { status: ride.status } as Prisma.InputJsonObject,
        after_data: { status: updated.status } as Prisma.InputJsonObject,
      });
      return { kind: 'success' as const, ride: updated };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
