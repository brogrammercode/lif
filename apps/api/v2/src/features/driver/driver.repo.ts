import { trip_distance_m } from '../driver_operations/trip.rules.js';
import { findApprovedDriverUpi } from '../driver_operations/driver_payout.js';
import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service.js';
import {
  requireActiveAccount,
  requireDriverParticipation,
} from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import { insertUserLog } from '../../database/user-log.js';
import { AppError } from '../../core/error.js';
import { CATEGORY_MESSAGES } from '../vehicle_category/vehicle_category.constant.js';
import { is_vehicle_eligible } from '../vehicle_category/vehicle_category.security.js';
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
} from './dto/driver.dto.js';
import {
  appendActiveRideLocation,
  categoryView,
  driverProfileColumns,
  driverProfileView,
  findDriverActiveRide,
  findDriverMatchingProfile,
  findMatchingRules,
  findOfferDetails,
  findOwnedOfferRide,
  findOwnedMatchingVehicle,
  findRiderActiveRide,
  selectableDriverCategory,
  updateDriverLocation,
} from './sql/driver-profile.sql.js';

type ProfileRow = {
  id: string;
  verification_status: string;
  last_location_at: Date | null;
};

type ProfileView = ProfileRow & {
  rating_average: string;
  user: { id: string; role: string };
  vehicles: Record<string, unknown>[];
};

type DriverCategory = { id: string; vehicle_type: string; capacity: number };
type VehicleRow = {
  id: string;
  type: string;
  capacity: number;
  verification_version: number;
  vehicle_category_id: string | null;
};
type MatchingVehicle = NonNullable<Parameters<typeof is_vehicle_eligible>[0]>;
type MatchingProfile = ProfileRow & {
  availability: string;
  active_vehicle_id: string | null;
  current_latitude: string | null;
  current_longitude: string | null;
  last_location_accuracy_m: number | null;
  user: { status: string };
  active_vehicle:
    | (MatchingVehicle & {
        vehicle_category:
          | (NonNullable<MatchingVehicle['vehicle_category']> & { id: string })
          | null;
      })
    | null;
};
type MatchingRules = {
  location_max_age_s: number;
  arrival_radius_m: number;
  matching_max_radius_km: number;
  search_timeout_s: number;
};
type OfferDetails = {
  status: string;
  expires_at: Date;
  ride_id: string;
  driver_id: string | null;
  ride_status: string;
  requested_at: Date | null;
  created_at: Date;
  pickup_latitude: string;
  pickup_longitude: string;
  search_radius_km: number | null;
  collection_preference: string | null;
  passenger_count: number;
  selected_quote: NonNullable<Parameters<typeof is_vehicle_eligible>[1]> | null;
};

@Injectable()
export class DriverRepository {
  constructor(private readonly db: PostgresService) {}

  readonly get_profile_by_user = async (user_id: string) =>
    (await this.db.query<ProfileView>(driverProfileView, [user_id])).rows[0] ??
    null;

  readonly create_driver_profile = async (
    user_id: string,
    input: DriverProfileInput,
  ) =>
    this.db.transaction(
      async (tx) => {
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
          user_id,
        ]);
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [applicant],
        } = await tx.query<{
          role: string;
          partner_activated_at: Date | null;
        }>('SELECT role,partner_activated_at FROM users WHERE id=$1', [
          user_id,
        ]);
        if (!applicant?.partner_activated_at && applicant?.role !== 'DRIVER')
          throw new AppError(
            403,
            'PARTNER_ACTIVATION_REQUIRED',
            'Complete Partner Program approval and activation before registering as a driver.',
          );
        const {
          rows: [existing],
        } = await tx.query('SELECT id FROM driver_profiles WHERE user_id=$1', [
          user_id,
        ]);
        if (existing)
          throw new AppError(
            409,
            'DRIVER_PROFILE_EXISTS',
            DRIVER_PROFILE_EXISTS_MESSAGE,
          );
        const profileId = nextEntityId();
        const {
          rows: [profile],
        } = await tx.query(
          `INSERT INTO driver_profiles AS p (id,user_id,license_number,updated_at)
          VALUES ($1,$2,$3,clock_timestamp()) RETURNING ${driverProfileColumns}`,
          [profileId, user_id, input.license_number ?? null],
        );
        await tx.query(
          "UPDATE users SET role='DRIVER',updated_at=clock_timestamp() WHERE id=$1 AND role='RIDER'",
          [user_id],
        );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'DriverProfile',
          entity_id: profileId,
          action: 'CREATE_DRIVER_PROFILE',
          after_data: profile,
        });
        return (
          (await tx.query<ProfileView>(driverProfileView, [user_id])).rows[0] ??
          null
        );
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 15000 },
    );

  readonly set_availability = async (
    user_id: string,
    input: AvailabilityInput,
  ) =>
    this.db.transaction(
      async (tx) => {
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock(720054, hashtext($1))', [
          user_id,
        ]);
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
          user_id,
        ]);
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [profile],
        } = await tx.query<MatchingProfile>(findDriverMatchingProfile, [
          user_id,
        ]);
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
          const {
            rows: [rules],
          } = await tx.query<MatchingRules>(findMatchingRules);
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
          const category = profile.active_vehicle?.vehicle_category;
          if (
            !category ||
            !is_vehicle_eligible(
              profile.active_vehicle,
              {
                vehicle_category_id: category.id,
                vehicle_type: category.vehicle_type,
                category_snapshot: null,
              },
              profile.id,
            )
          )
            throw new AppError(
              409,
              'VEHICLE_NOT_READY',
              VEHICLE_NOT_READY_MESSAGE,
            );
        }

        if ((await tx.query(findDriverActiveRide, [profile.id])).rowCount)
          throw new AppError(409, 'DRIVER_ON_TRIP', DRIVER_ON_TRIP_MESSAGE);
        if (
          input.availability === 'AVAILABLE' &&
          (await tx.query(findRiderActiveRide, [user_id])).rowCount
        )
          throw new AppError(
            409,
            'ACTIVE_RIDE_EXISTS',
            'Finish or cancel your rider journey before going online as a driver.',
          );

        const {
          rows: [updated],
        } = await tx.query<ProfileRow & { availability: string }>(
          `UPDATE driver_profiles p SET availability=$2,
          current_latitude=COALESCE($3,current_latitude),current_longitude=COALESCE($4,current_longitude),
          last_location_accuracy_m=CASE WHEN $3 IS NULL THEN last_location_accuracy_m ELSE NULL END,
          last_location_at=CASE WHEN $3 IS NOT NULL AND $4 IS NOT NULL THEN statement_timestamp() ELSE last_location_at END,
          updated_at=clock_timestamp() WHERE p.id=$1 RETURNING ${driverProfileColumns}`,
          [
            profile.id,
            input.availability,
            input.latitude ?? null,
            input.longitude ?? null,
          ],
        );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'DriverProfile',
          entity_id: profile.id,
          action: 'UPDATE_DRIVER_AVAILABILITY',
          before_data: { availability: profile.availability },
          after_data: { availability: input.availability },
        });
        return updated;
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 15000 },
    );

  readonly create_vehicle = async (user_id: string, input: VehicleInput) =>
    this.db.transaction(
      async (tx) => {
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
          user_id,
        ]);
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [profile],
        } = await tx.query<{ id: string; active_vehicle_id: string | null }>(
          'SELECT id,active_vehicle_id FROM driver_profiles WHERE user_id=$1',
          [user_id],
        );
        if (!profile) return null;
        const {
          rows: [category],
        } = await tx.query<DriverCategory>(selectableDriverCategory, [
          !!input.vehicle_category_id,
          input.vehicle_category_id || input.type,
        ]);
        if (!category)
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
        const {
          rows: [vehicle],
        } = await tx.query<VehicleRow>(
          `INSERT INTO vehicles (id,driver_id,type,vehicle_category_id,make,model,
          color,plate_number,capacity,photo_url,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()) RETURNING *`,
          [
            nextEntityId(),
            profile.id,
            category.vehicle_type,
            category.id,
            input.make,
            input.model,
            input.color ?? null,
            input.plate_number.toUpperCase().replace(/[\s-]+/g, ''),
            input.capacity ?? category.capacity,
            input.photo_url ?? null,
          ],
        );
        if (!vehicle) throw new Error('Vehicle insert returned no row');
        if (!profile.active_vehicle_id)
          await tx.query(
            'UPDATE driver_profiles SET active_vehicle_id=$2,updated_at=clock_timestamp() WHERE id=$1',
            [profile.id, vehicle.id],
          );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'Vehicle',
          entity_id: vehicle.id,
          action: 'CREATE_VEHICLE',
          after_data: vehicle,
        });
        return vehicle;
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 15000 },
    );

  readonly change_vehicle_category = async (
    user_id: string,
    vehicle_id: string,
    category_id: string,
  ) =>
    this.db.transaction(
      async (tx) => {
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
          user_id,
        ]);
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [vehicle],
        } = await tx.query<VehicleRow>(
          'SELECT v.* FROM vehicles v JOIN driver_profiles p ON p.id=v.driver_id WHERE v.id=$1 AND p.user_id=$2',
          [vehicle_id, user_id],
        );
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
        const {
          rows: [active_ride],
        } = await tx.query(
          `SELECT id FROM rides WHERE vehicle_id=$1
            AND status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_WAITING','IN_PROGRESS') LIMIT 1`,
          [vehicle_id],
        );
        if (active_ride)
          throw new AppError(409, 'VEHICLE_ON_TRIP', DRIVER_ON_TRIP_MESSAGE);
        const {
          rows: [category],
        } = await tx.query<DriverCategory>(selectableDriverCategory, [
          true,
          category_id,
        ]);
        if (!category)
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
        const {
          rows: [updated],
        } = await tx.query(
          `UPDATE vehicles v SET vehicle_category_id=category.id,updated_at=clock_timestamp()
          FROM vehicle_categories category WHERE v.id=$1 AND category.id=$2
          RETURNING v.*,${categoryView} AS vehicle_category`,
          [vehicle.id, category.id],
        );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'Vehicle',
          entity_id: vehicle.id,
          action: 'CHANGE_VEHICLE_CATEGORY',
          before_data: { vehicle_category_id: vehicle.vehicle_category_id },
          after_data: { vehicle_category_id: category.id },
        });
        return updated;
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 15000 },
    );

  readonly select_active_vehicle = async (
    user_id: string,
    vehicle_id: string,
  ) =>
    this.db.transaction(
      async (tx) => {
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
          user_id,
        ]);
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [row],
        } = await tx.query<{
          vehicle: NonNullable<MatchingProfile['active_vehicle']>;
        }>(findOwnedMatchingVehicle, [vehicle_id, user_id]);
        if (!row)
          throw new AppError(
            404,
            'VEHICLE_NOT_FOUND',
            VEHICLE_NOT_FOUND_MESSAGE,
          );
        const vehicle = row.vehicle;
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
        const {
          rows: [before],
        } = await tx.query<{ active_vehicle_id: string | null }>(
          'SELECT active_vehicle_id FROM driver_profiles WHERE id=$1',
          [vehicle.driver_id],
        );
        if (!before)
          throw new AppError(
            404,
            'VEHICLE_NOT_FOUND',
            VEHICLE_NOT_FOUND_MESSAGE,
          );
        if (
          (await tx.query(findDriverActiveRide, [vehicle.driver_id])).rowCount
        )
          throw new AppError(409, 'DRIVER_ON_TRIP', DRIVER_ON_TRIP_MESSAGE);
        const {
          rows: [updated],
        } = await tx.query<ProfileRow>(
          `UPDATE driver_profiles p SET active_vehicle_id=$2,updated_at=clock_timestamp()
          WHERE p.id=$1 RETURNING ${driverProfileColumns}`,
          [vehicle.driver_id, vehicle_id],
        );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'DriverProfile',
          entity_id: vehicle.driver_id,
          action: 'SELECT_ACTIVE_VEHICLE',
          before_data: { active_vehicle_id: before.active_vehicle_id },
          after_data: { active_vehicle_id: vehicle_id },
        });
        return updated;
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 15000 },
    );

  readonly accept_offer = async (user_id: string, offer_id: string) =>
    this.db.transaction(
      async (tx) => {
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock(720054, hashtext($1))', [
          user_id,
        ]);
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        const {
          rows: [initial],
        } = await tx.query<{ ride_id: string }>(findOwnedOfferRide, [
          offer_id,
          user_id,
        ]);
        if (!initial) return { kind: 'not_found' as const };
        await tx.query('SELECT pg_advisory_xact_lock(720044, hashtext($1))', [
          initial.ride_id,
        ]);
        await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
          user_id,
        ]);
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [profile],
        } = await tx.query<MatchingProfile>(findDriverMatchingProfile, [
          user_id,
        ]);
        const {
          rows: [offer],
        } = await tx.query<OfferDetails>(findOfferDetails, [offer_id, user_id]);
        if (!profile || !offer) return { kind: 'not_found' as const };
        if (
          offer.status === 'ACCEPTED' &&
          offer.driver_id === profile.id &&
          [
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_WAITING',
            'IN_PROGRESS',
          ].includes(offer.ride_status)
        )
          return { kind: 'success' as const, ride_id: offer.ride_id };

        if (
          (await tx.query(findRiderActiveRide, [user_id])).rowCount ||
          offer.status !== 'SENT' ||
          offer.expires_at.getTime() <= Date.now() ||
          offer.ride_status !== 'SEARCHING' ||
          !profile.active_vehicle_id
        )
          return { kind: 'not_available' as const };

        const {
          rows: [rules],
        } = await tx.query<MatchingRules>(findMatchingRules);
        if (
          profile.current_latitude === null ||
          profile.current_longitude === null ||
          !profile.last_location_at ||
          Date.now() - profile.last_location_at.getTime() >
            (rules?.location_max_age_s ?? 60) * 1000 ||
          profile.last_location_accuracy_m === null ||
          profile.last_location_accuracy_m > (rules?.arrival_radius_m ?? 150)
        )
          return { kind: 'not_available' as const };

        if (
          (Date.now() - (offer.requested_at ?? offer.created_at).getTime()) /
            1000 >=
            (rules?.search_timeout_s ?? 180) ||
          trip_distance_m(
            Number(profile.current_latitude),
            Number(profile.current_longitude),
            Number(offer.pickup_latitude),
            Number(offer.pickup_longitude),
          ) >
            (offer.search_radius_km ?? rules?.matching_max_radius_km ?? 10) *
              1000
        )
          return { kind: 'not_available' as const };

        if (
          offer.collection_preference === 'UPI' &&
          !(await findApprovedDriverUpi(tx, user_id))
        )
          return { kind: 'not_available' as const };

        if (
          profile.user.status !== 'ACTIVE' ||
          profile.verification_status !== 'VERIFIED' ||
          profile.availability !== 'AVAILABLE' ||
          (profile.active_vehicle?.capacity ?? 0) <
            (offer.passenger_count ?? 1) ||
          !is_vehicle_eligible(
            profile.active_vehicle,
            offer.selected_quote ?? undefined,
            profile.id,
          ) ||
          (await tx.query(findDriverActiveRide, [profile.id])).rowCount
        )
          return { kind: 'not_available' as const };

        const changed = await tx.query(
          `UPDATE rides SET status='DRIVER_ASSIGNED',driver_id=$2,vehicle_id=$3,
          matched_at=statement_timestamp(),updated_at=clock_timestamp()
          WHERE id=$1 AND status='SEARCHING' AND driver_id IS NULL`,
          [offer.ride_id, profile.id, profile.active_vehicle_id],
        );
        if (changed.rowCount !== 1) return { kind: 'not_available' as const };
        await tx.query(
          `UPDATE ride_offers SET status='ACCEPTED',responded_at=statement_timestamp(),updated_at=clock_timestamp()
          WHERE id=$1`,
          [offer_id],
        );
        await tx.query(
          `UPDATE ride_offers SET status='CANCELLED',responded_at=statement_timestamp(),updated_at=clock_timestamp()
          WHERE ride_id=$1 AND id<>$2 AND status='SENT'`,
          [offer.ride_id, offer_id],
        );
        await tx.query(
          "UPDATE driver_profiles SET availability='EN_ROUTE',updated_at=clock_timestamp() WHERE id=$1",
          [profile.id],
        );
        await tx.query(
          `INSERT INTO ride_events (id,ride_id,actor_id,event_type,updated_at)
          VALUES ($1,$2,$3,'DRIVER_ACCEPTED',clock_timestamp())`,
          [nextEntityId(), offer.ride_id, user_id],
        );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'Ride',
          entity_id: offer.ride_id,
          action: 'ACCEPT_RIDE_OFFER',
          after_data: {
            driver_id: profile.id,
            vehicle_id: profile.active_vehicle_id,
          },
        });
        return { kind: 'success' as const, ride_id: offer.ride_id };
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 15000 },
    );

  readonly reject_offer = async (user_id: string, offer_id: string) =>
    this.db.transaction(
      async (tx) => {
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
          user_id,
        ]);
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [offer],
        } = await tx.query(findOwnedOfferRide, [offer_id, user_id]);
        if (!offer) return false;
        const changed = await tx.query(
          `UPDATE ride_offers o SET status='REJECTED',responded_at=statement_timestamp(),
          updated_at=clock_timestamp() FROM rides r,driver_profiles p
          WHERE o.id=$1 AND p.id=o.driver_id AND p.user_id=$2 AND r.id=o.ride_id
            AND o.status='SENT' AND o.expires_at>statement_timestamp() AND r.status='SEARCHING'`,
          [offer_id, user_id],
        );
        if (changed.rowCount !== 1)
          throw new AppError(
            409,
            'OFFER_NOT_AVAILABLE',
            OFFER_NOT_AVAILABLE_MESSAGE,
          );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'RideOffer',
          entity_id: offer_id,
          action: 'REJECT_RIDE_OFFER',
        });
        return true;
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 15000 },
    );

  readonly record_location = async (user_id: string, input: LocationInput) =>
    this.db.transaction(
      async (tx) => {
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
          user_id,
        ]);
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [profile],
        } = await tx.query<ProfileRow>(
          `SELECT ${driverProfileColumns} FROM driver_profiles p WHERE p.user_id=$1`,
          [user_id],
        );
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
        const {
          rows: [updated],
        } = await tx.query<ProfileRow>(updateDriverLocation, [
          profile.id,
          input.latitude,
          input.longitude,
          fix_at,
          input.accuracy_m ?? null,
        ]);
        await tx.query(appendActiveRideLocation, [
          nextEntityId(),
          profile.id,
          input.latitude,
          input.longitude,
          input.heading ?? null,
          input.speed_kph ?? null,
          fix_at,
        ]);
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'DriverProfile',
          entity_id: profile.id,
          action: 'UPDATE_DRIVER_LOCATION',
        });
        return updated;
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 15000 },
    );
}
