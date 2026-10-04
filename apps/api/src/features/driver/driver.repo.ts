import { Prisma } from '@prisma/client';
import { prisma } from '../../infra/database/client.js';
import { create_user_log } from '../../infra/database/user_log.js';
import type { AvailabilityInput, DriverProfileInput, LocationInput, VehicleInput } from './driver.type.js';

export const get_profile_by_user = async (user_id: string) =>
  prisma.driverProfile.findUnique({ where: { user_id }, include: { user: true, vehicles: true, documents: true, active_vehicle: true } });

export const create_driver_profile = async (user_id: string, input: DriverProfileInput) =>
  prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.create({ data: { user_id, license_number: input.license_number } });
    await tx.user.update({ where: { id: user_id }, data: { role: 'DRIVER' } });
    await create_user_log(tx, {
      actor_id: user_id,
      entity_type: 'DriverProfile',
      entity_id: profile.id,
      action: 'CREATE_DRIVER_PROFILE',
      after_data: profile as unknown as Prisma.InputJsonObject,
    });
    return get_profile_by_user(user_id);
  });

export const set_availability = async (user_id: string, input: AvailabilityInput) =>
  prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.findUnique({ where: { user_id } });
    if (!profile) return null;
    const updated = await tx.driverProfile.update({
      where: { id: profile.id },
      data: {
        availability: input.availability,
        current_latitude: input.latitude,
        current_longitude: input.longitude,
        last_location_at: input.latitude !== undefined && input.longitude !== undefined ? new Date() : profile.last_location_at,
      },
    });
    await create_user_log(tx, {
      actor_id: user_id,
      entity_type: 'DriverProfile',
      entity_id: profile.id,
      action: 'UPDATE_DRIVER_AVAILABILITY',
      before_data: { availability: profile.availability } as Prisma.InputJsonObject,
      after_data: { availability: updated.availability } as Prisma.InputJsonObject,
    });
    return updated;
  });

export const create_vehicle = async (user_id: string, input: VehicleInput) =>
  prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.findUnique({ where: { user_id } });
    if (!profile) return null;
    const vehicle = await tx.vehicle.create({
      data: {
        driver_id: profile.id,
        type: input.type,
        make: input.make,
        model: input.model,
        color: input.color,
        plate_number: input.plate_number.toUpperCase(),
        capacity: input.capacity,
        photo_url: input.photo_url,
      },
    });
    await create_user_log(tx, {
      actor_id: user_id,
      entity_type: 'Vehicle',
      entity_id: vehicle.id,
      action: 'CREATE_VEHICLE',
      after_data: vehicle as unknown as Prisma.InputJsonObject,
    });
    return vehicle;
  });

export const list_offers = async (user_id: string) =>
  prisma.rideOffer.findMany({
    where: { driver: { user_id }, status: 'SENT' },
    orderBy: { sent_at: 'desc' },
    include: { ride: { include: { quotes: true, route: true } } },
  });

export const accept_offer = async (user_id: string, offer_id: string) =>
  prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.findUnique({ where: { user_id }, include: { active_vehicle: true } });
    const offer = await tx.rideOffer.findFirst({ where: { id: offer_id, driver: { user_id } }, include: { ride: true } });
    if (!profile || !offer) return { kind: 'not_found' as const };
    if (offer.status !== 'SENT' || offer.expires_at.getTime() <= Date.now() || offer.ride.status !== 'SEARCHING' || !profile.active_vehicle_id) return { kind: 'not_available' as const };
    const updated_ride = await tx.ride.updateMany({ where: { id: offer.ride_id, status: 'SEARCHING', driver_id: null }, data: { status: 'DRIVER_ASSIGNED', driver_id: profile.id, vehicle_id: profile.active_vehicle_id, matched_at: new Date() } });
    if (updated_ride.count !== 1) return { kind: 'not_available' as const };
    await tx.rideOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', responded_at: new Date() } });
    await tx.driverProfile.update({ where: { id: profile.id }, data: { availability: 'EN_ROUTE' } });
    await tx.rideEvent.create({ data: { ride_id: offer.ride_id, actor_id: user_id, event_type: 'DRIVER_ACCEPTED' } });
    await create_user_log(tx, {
      actor_id: user_id,
      entity_type: 'Ride',
      entity_id: offer.ride_id,
      action: 'ACCEPT_RIDE_OFFER',
      after_data: { driver_id: profile.id, vehicle_id: profile.active_vehicle_id } as Prisma.InputJsonObject,
    });
    return { kind: 'success' as const, ride_id: offer.ride_id };
  });

export const reject_offer = async (user_id: string, offer_id: string) =>
  prisma.$transaction(async (tx) => {
    const offer = await tx.rideOffer.findFirst({ where: { id: offer_id, driver: { user_id } } });
    if (!offer) return false;
    await tx.rideOffer.update({ where: { id: offer_id }, data: { status: 'REJECTED', responded_at: new Date() } });
    await create_user_log(tx, { actor_id: user_id, entity_type: 'RideOffer', entity_id: offer_id, action: 'REJECT_RIDE_OFFER' });
    return true;
  });

export const record_location = async (user_id: string, input: LocationInput) =>
  prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.findUnique({ where: { user_id } });
    if (!profile) return null;
    const updated = await tx.driverProfile.update({ where: { id: profile.id }, data: { current_latitude: input.latitude, current_longitude: input.longitude, last_location_at: new Date() } });
    const active_ride = await tx.ride.findFirst({ where: { driver_id: profile.id, status: { in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_WAITING', 'IN_PROGRESS'] } }, orderBy: { created_at: 'desc' } });
    if (active_ride) {
      await tx.rideLocation.create({ data: { ride_id: active_ride.id, driver_id: profile.id, latitude: input.latitude, longitude: input.longitude, heading: input.heading, speed_kph: input.speed_kph } });
    }
    return updated;
  });

export const transition_ride = async (user_id: string, ride_id: string, target: 'DRIVER_WAITING' | 'IN_PROGRESS' | 'COMPLETED') =>
  prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.findUnique({ where: { user_id } });
    const ride = await tx.ride.findFirst({ where: { id: ride_id, driver_id: profile?.id } });
    if (!profile || !ride) return { kind: 'not_found' as const };
    const transitions = {
      DRIVER_WAITING: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING'],
      IN_PROGRESS: ['DRIVER_WAITING'],
      COMPLETED: ['IN_PROGRESS'],
    } as const;
    if (!(transitions[target] as readonly string[]).includes(ride.status)) return { kind: 'invalid_state' as const };
    const event_type = target === 'DRIVER_WAITING' ? 'DRIVER_WAITING' : target === 'IN_PROGRESS' ? 'TRIP_STARTED' : 'TRIP_COMPLETED';
    const updated = await tx.ride.update({
      where: { id: ride_id },
      data: target === 'DRIVER_WAITING'
        ? { status: target, arrived_at: new Date() }
        : target === 'IN_PROGRESS'
          ? { status: target, started_at: new Date() }
          : { status: target, completed_at: new Date(), final_fare: ride.estimated_fare, actual_distance_m: ride.estimated_distance_m, actual_duration_s: ride.estimated_duration_s },
    });
    await tx.rideEvent.create({ data: { ride_id, actor_id: user_id, event_type } });
    if (target === 'COMPLETED') {
      await tx.driverProfile.update({ where: { id: profile.id }, data: { availability: 'AVAILABLE', completed_rides: { increment: 1 } } });
    }
    await create_user_log(tx, { actor_id: user_id, entity_type: 'Ride', entity_id: ride_id, action: `DRIVER_${target}`, before_data: { status: ride.status } as Prisma.InputJsonObject, after_data: { status: updated.status } as Prisma.InputJsonObject });
    return { kind: 'success' as const, ride: updated };
  });
