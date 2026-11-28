import type { JsonValue } from '../../database/json-value.js';
import { requireActiveAdmin } from '../../database/account-locks.js';
import { settlementReviewsPage } from './sql/trip-settlements.sql.js';
import { pending_review_statuses } from '../admin_pending/pending.rules.js';
import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { AppError } from '../../core/error.js';
import { GeocodeService } from '../geocode/geocode.service.js';
import { is_vehicle_eligible } from '../vehicle_category/vehicle_category.security.js';
import { availability_after_trip } from '../driver/driver_eligibility.js';
import {
  findApprovedDriverUpi,
  findApprovedDriverUpis,
} from './driver_payout.js';
import {
  availabilityDraftQuote,
  availabilityDrivers,
  dashboardDispatchQueue,
  dashboardOffers,
  dispatchCandidates,
  dispatchRide,
  matchingSettings,
} from './sql/matching-read.sql.js';
import { findDriverMatchingProfile } from '../driver/sql/driver-profile.sql.js';
import { driverResumableRideId } from '../travel_context/sql/travel-context.sql.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  readRideAccess,
  writeRideAccess,
  type RideAccess,
} from './sql/trip-access.sql.js';
import { tripContextSnapshot } from './sql/trip-context.sql.js';
import {
  notifyTripParticipant,
  recordTripEvent,
  resetTripVerification,
} from './sql/trip-lifecycle.sql.js';
import { require_supported_ride_payment } from '../app_configuration/payment_policy.js';
import {
  gateway_credential_mode,
  payout_schedule_lock,
} from '../wallet/wallet-controls.js';
import { record_cash_ride } from '../wallet/cash-ride-entry.js';
import type { ContextTrip, Trip } from './trip-context.types.js';
import {
  ACTIVE_TRIP,
  trip_distance_m,
  search_radius_km,
  matches_trip_code,
  reveal_trip_code,
} from './trip.rules.js';

type MatchingSettings = {
  arrival_radius_m: number;
  location_max_age_s: number;
  matching_initial_radius_km: number;
  matching_max_radius_km: number;
  matching_expansion_s: number;
  search_timeout_s: number;
  offer_lifetime_s: number;
};
type AvailabilityDraft = NonNullable<
  Parameters<typeof is_vehicle_eligible>[1]
> & {
  pickup_latitude: string;
  pickup_longitude: string;
  category_snapshot: JsonValue;
};
type AvailabilityDriver = {
  id: string;
  user_id: string;
  first_name: string | null;
  avatar_url: string | null;
  current_latitude: string;
  current_longitude: string;
  rating_average: string;
  ratings_count: number;
  active_vehicle: NonNullable<Trip['driver']>['active_vehicle'];
};
type DashboardDriver = Parameters<typeof availability_after_trip>[0] & {
  last_location_at: Date | null;
  last_location_accuracy_m: number | null;
};
type DispatchRide = Pick<
  AvailabilityDraft,
  'pickup_latitude' | 'pickup_longitude'
> & {
  status: string;
  rider_id: string;
  requested_at: Date | null;
  created_at: Date;
  next_dispatch_at: Date | null;
  passenger_count: number;
  collection_preference: string | null;
  quote: Omit<AvailabilityDraft, 'pickup_latitude' | 'pickup_longitude'> | null;
};
type DispatchDriver = Pick<
  AvailabilityDriver,
  'id' | 'user_id' | 'current_latitude' | 'current_longitude' | 'active_vehicle'
> & {
  availability: string;
};
function matchingBounds(latitude: number, longitude: number, radius: number) {
  const latDelta = radius / 111;
  const lonDelta =
    radius / (111 * Math.max(0.01, Math.cos((latitude * Math.PI) / 180)));
  return [
    Math.max(-90, latitude - latDelta),
    Math.min(90, latitude + latDelta),
    Math.max(-180, longitude - lonDelta),
    Math.min(180, longitude + lonDelta),
  ];
}
const active = (status: string) =>
  (ACTIVE_TRIP as readonly string[]).includes(status);
const allowsTripContact = (trip: RideAccess) =>
  active(trip.status) ||
  (trip.status === 'COMPLETED' &&
    (!trip.payment_status ||
      ['PENDING', 'FAILED'].includes(trip.payment_status)));
const object = (v: JsonValue | undefined) =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const payment_policy = (trip: Trip) =>
  object(object(trip.quotes[0]?.category_snapshot).payment_policy);
const wallet_available_for = (trip: Trip) =>
  trip.status === 'COMPLETED' &&
  trip.currency === 'INR' &&
  Boolean(trip.final_fare?.gt(0) && trip.driver && !trip.settlement_review);
const awaiting_wallet = (trip: Trip) =>
  wallet_available_for(trip) &&
  trip.payment?.status === 'PENDING' &&
  trip.payment.collection_method === 'WALLET' &&
  trip.payment.updated_at.getTime() + 120_000 > Date.now();
@Injectable()
export class DriverOperationsService {
  constructor(
    private readonly routing: GeocodeService,
    private readonly postgres: PostgresService,
  ) {}

  async settings() {
    const {
      rows: [row],
    } = await this.postgres.query<MatchingSettings>(matchingSettings);
    return {
      arrival_radius_m: row?.arrival_radius_m ?? 150,
      location_max_age_s: row?.location_max_age_s ?? 60,
      matching_initial_radius_km: row?.matching_initial_radius_km ?? 1,
      matching_max_radius_km: row?.matching_max_radius_km ?? 10,
      matching_expansion_s: row?.matching_expansion_s ?? 30,
      search_timeout_s: row?.search_timeout_s ?? 180,
      offer_lifetime_s: row?.offer_lifetime_s ?? 45,
    };
  }

  /** Public-safe bounded availability snapshot; never reserves or assigns a driver. */
  async rider_availability(
    user_id: string,
    input: {
      draft_ride_id: string;
      quote_id: string;
      payment_preference: 'CASH' | 'UPI';
      passenger_count: number;
    },
  ) {
    const settings = await this.settings();
    const {
      rows: [quote],
    } = await this.postgres.query<AvailabilityDraft>(availabilityDraftQuote, [
      input.draft_ride_id,
      user_id,
      input.quote_id,
    ]);
    if (!quote?.vehicle_category_id)
      throw new AppError(
        409,
        'QUOTE_UNAVAILABLE',
        'Get fresh ride options before checking availability.',
      );
    require_supported_ride_payment(
      quote.category_snapshot,
      input.payment_preference,
    );
    const latitude = Number(quote.pickup_latitude),
      longitude = Number(quote.pickup_longitude);
    const radius = settings.matching_initial_radius_km;
    const { rows } = await this.postgres.query<AvailabilityDriver>(
      availabilityDrivers,
      [
        user_id,
        ...matchingBounds(latitude, longitude, radius),
        new Date(Date.now() - settings.location_max_age_s * 1000),
        settings.arrival_radius_m,
        quote.vehicle_category_id,
        input.passenger_count,
      ],
    );
    const eligible = rows.filter(
      (d) =>
        d.current_latitude &&
        d.current_longitude &&
        is_vehicle_eligible(d.active_vehicle, quote, d.id) &&
        trip_distance_m(
          latitude,
          longitude,
          Number(d.current_latitude),
          Number(d.current_longitude),
        ) <=
          radius * 1000,
    );
    const upis =
      input.payment_preference === 'UPI'
        ? await findApprovedDriverUpis(
            this.postgres,
            eligible.map((d) => d.user_id),
          )
        : null;
    return {
      captured_at: new Date().toISOString(),
      radius_km: radius,
      preview_only: true,
      items: eligible
        .filter((d) => !upis || upis.has(d.user_id))
        .slice(0, 8)
        .map((d) => ({
          distance_m:
            Math.round(
              trip_distance_m(
                latitude,
                longitude,
                Number(d.current_latitude),
                Number(d.current_longitude),
              ) / 50,
            ) * 50,
          map_position: {
            latitude: Number(Number(d.current_latitude).toFixed(3)),
            longitude: Number(Number(d.current_longitude).toFixed(3)),
          },
          driver: {
            user: {
              first_name: d.first_name,
              avatar_url: d.avatar_url,
            },
            rating_average: d.rating_average,
            ratings_count: d.ratings_count,
          },
          vehicle: {
            make: d.active_vehicle!.make,
            model: d.active_vehicle!.model,
            color: d.active_vehicle!.color,
            capacity: d.active_vehicle!.capacity,
            brand: d.active_vehicle!.brand
              ? {
                  name: d.active_vehicle!.brand.name,
                  logo_url: d.active_vehicle!.brand.logo_url,
                }
              : null,
            photo_url:
              typeof object(quote.category_snapshot).image_url === 'string'
                ? object(quote.category_snapshot).image_url
                : null,
          },
        })),
    };
  }

  private async read_owned(
    user_id: string,
    ride_id: string,
    db: SqlClient = this.postgres,
  ) {
    const {
      rows: [trip],
    } = await db.query<ContextTrip>(tripContextSnapshot, [ride_id, user_id]);
    if (!trip)
      throw new AppError(
        404,
        'RIDE_NOT_FOUND',
        'This trip is not available to your account.',
      );
    const date = (value: Date) =>
      value instanceof Date ? value : new Date(value);
    return {
      ...trip,
      estimated_fare:
        trip.estimated_fare == null ? null : new Decimal(trip.estimated_fare),
      final_fare: trip.final_fare == null ? null : new Decimal(trip.final_fare),
      driver: trip.driver
        ? {
            ...trip.driver,
            last_location_at: trip.driver.last_location_at
              ? date(trip.driver.last_location_at)
              : null,
          }
        : null,
      payment: trip.payment
        ? { ...trip.payment, updated_at: date(trip.payment.updated_at) }
        : null,
      start_verification: trip.start_verification
        ? {
            ...trip.start_verification,
            assignment_at: date(trip.start_verification.assignment_at),
            expires_at: date(trip.start_verification.expires_at),
          }
        : null,
      settlement_review: trip.settlement_review
        ? {
            ...trip.settlement_review,
            fee_amount: new Decimal(trip.settlement_review.fee_amount),
          }
        : null,
    };
  }

  async dispatch(ride_id: string) {
    const settings = await this.settings();
    await this.postgres.transaction(
      async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        const {
          rows: [lock],
        } = await tx.query<{ locked: boolean }>(
          'SELECT pg_try_advisory_xact_lock(720044,hashtext($1)) AS locked',
          [ride_id],
        );
        if (!lock?.locked) return;
        const {
          rows: [ride],
        } = await tx.query<DispatchRide>(dispatchRide, [ride_id]);
        const now = Date.now();
        if (
          !ride ||
          ride.status !== 'SEARCHING' ||
          (ride.next_dispatch_at && ride.next_dispatch_at.getTime() > now)
        )
          return;
        const ageSeconds =
          (now - (ride.requested_at ?? ride.created_at).getTime()) / 1000;
        if (ageSeconds >= settings.search_timeout_s) {
          await tx.query(
            "UPDATE rides SET status='NO_DRIVER_FOUND',updated_at=clock_timestamp() WHERE id=$1",
            [ride_id],
          );
          await tx.query(
            "UPDATE ride_offers SET status='EXPIRED',updated_at=clock_timestamp() WHERE ride_id=$1 AND status='SENT'",
            [ride_id],
          );
          await tx.query(
            `INSERT INTO ride_events (id,ride_id,event_type,updated_at)
            VALUES ($1,$2,'NO_DRIVER_FOUND',clock_timestamp())`,
            [nextEntityId(), ride_id],
          );
          await tx.query(
            `INSERT INTO notifications (id,user_id,type,title,body,data,updated_at)
            VALUES ($1,$2,'RIDE_UPDATE','No driver available',
              'No driver accepted this request. You have not been charged.',
              jsonb_build_object('ride_id',$3::text),clock_timestamp())`,
            [nextEntityId(), ride.rider_id, ride_id],
          );
          return;
        }

        const radius = search_radius_km(
          ageSeconds,
          settings.matching_initial_radius_km,
          settings.matching_max_radius_km,
          settings.matching_expansion_s,
        );
        await tx.query(
          'UPDATE rides SET search_radius_km=$2,next_dispatch_at=$3,updated_at=clock_timestamp() WHERE id=$1',
          [ride_id, radius, new Date(now + 5000)],
        );
        const quote = ride.quote;
        if (!quote?.vehicle_category_id) return;
        const latitude = Number(ride.pickup_latitude),
          longitude = Number(ride.pickup_longitude);
        const { rows: candidates } = await tx.query<DispatchDriver>(
          dispatchCandidates,
          [
            ride.rider_id,
            ...matchingBounds(latitude, longitude, radius),
            new Date(now - settings.location_max_age_s * 1000),
            settings.arrival_radius_m,
            quote.vehicle_category_id,
          ],
        );
        const ranked = candidates
          .filter(
            (driver) =>
              is_vehicle_eligible(driver.active_vehicle, quote, driver.id) &&
              (driver.active_vehicle?.capacity ?? 0) >=
                (ride.passenger_count ?? 1),
          )
          .map((driver) => ({
            driver,
            distance: trip_distance_m(
              Number(driver.current_latitude),
              Number(driver.current_longitude),
              latitude,
              longitude,
            ),
          }))
          .filter(({ distance }) => distance <= radius * 1000)
          .sort(
            (a, b) =>
              Number(a.driver.availability !== 'AVAILABLE') -
                Number(b.driver.availability !== 'AVAILABLE') ||
              a.distance - b.distance,
          );
        const policy = object(object(quote.category_snapshot).payment_policy);
        const needsUpi =
          policy.cash_enabled === false || ride.collection_preference === 'UPI';
        const destinations = needsUpi
          ? await findApprovedDriverUpis(
              tx,
              ranked.map(({ driver }) => driver.user_id),
            )
          : null;
        const eligible = ranked.filter(
          ({ driver }) => !destinations || destinations.has(driver.user_id),
        );
        if (!eligible.length) return;

        const { rows: existing } = await tx.query<{
          driver_id: string;
          status: string;
          expires_at: Date;
        }>(
          'SELECT driver_id,status,expires_at FROM ride_offers WHERE ride_id=$1 AND driver_id=ANY($2::text[])',
          [ride_id, eligible.map(({ driver }) => driver.id)],
        );
        const offers = new Map(
          existing.map((offer) => [offer.driver_id, offer]),
        );
        let offered = 0;
        for (const { driver } of eligible) {
          const old = offers.get(driver.id);
          if (old && ['REJECTED', 'ACCEPTED'].includes(old.status)) continue;
          if (old?.status === 'SENT' && old.expires_at.getTime() > now) {
            if (++offered >= 8) break;
            continue;
          }
          const result = await tx.query(
            `INSERT INTO ride_offers (id,ride_id,driver_id,expires_at,updated_at)
            VALUES ($1,$2,$3,$4,clock_timestamp())
            ON CONFLICT (ride_id,driver_id) DO UPDATE SET status='SENT',sent_at=statement_timestamp(),
              responded_at=NULL,expires_at=EXCLUDED.expires_at,updated_at=clock_timestamp()
            WHERE ride_offers.status NOT IN ('REJECTED','ACCEPTED')`,
            [
              nextEntityId(),
              ride_id,
              driver.id,
              new Date(now + settings.offer_lifetime_s * 1000),
            ],
          );
          if (result.rowCount === 1 && ++offered >= 8) break;
        }
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 30000 },
    );
  }

  async dashboard(user_id: string) {
    const settings = await this.settings();
    const {
      rows: [profile],
    } = await this.postgres.query<DashboardDriver>(findDriverMatchingProfile, [
      user_id,
    ]);
    if (!profile)
      throw new AppError(
        403,
        'DRIVER_PROFILE_REQUIRED',
        'Complete driver activation and vehicle verification first.',
      );
    const { rows: searches } = await this.postgres.query<{ id: string }>(
      dashboardDispatchQueue,
    );
    for (const ride of searches) await this.dispatch(ride.id);
    const [
      {
        rows: [current],
      },
      {
        rows: [partner],
      },
    ] = await Promise.all([
      this.postgres.query<{ id: string; status: string }>(
        driverResumableRideId,
        [profile.id],
      ),
      this.postgres.query<{ status: string }>(
        'SELECT status FROM partner_applications WHERE current_user_id=$1',
        [user_id],
      ),
    ]);
    const exited = partner?.status === 'EXITED';
    const eligible =
      !exited && availability_after_trip(profile) === 'AVAILABLE';
    const fresh =
      !!profile.last_location_at &&
      profile.last_location_accuracy_m !== null &&
      profile.last_location_accuracy_m <= settings.arrival_radius_m &&
      Date.now() - profile.last_location_at.getTime() <=
        settings.location_max_age_s * 1000;
    const offers =
      eligible &&
      fresh &&
      ['AVAILABLE', 'ON_TRIP'].includes(profile.availability)
        ? (
            await this.postgres.query<{
              id: string;
              expires_at: Date;
              ride: Record<string, unknown>;
            }>(dashboardOffers, [profile.id])
          ).rows
        : [];
    return {
      availability: profile.availability,
      eligible,
      exited,
      location_fresh: fresh,
      settings,
      current_trip: current ?? null,
      vehicle: profile.active_vehicle
        ? {
            id: profile.active_vehicle.id,
            make: profile.active_vehicle.make,
            model: profile.active_vehicle.model,
            plate_number: profile.active_vehicle.plate_number,
            color: profile.active_vehicle.color,
            brand: profile.active_vehicle.brand
              ? {
                  name: profile.active_vehicle.brand.name,
                  logo_url: profile.active_vehicle.brand.logo_url,
                }
              : null,
          }
        : null,
      offers: offers.map((offer) => ({
        ...offer,
        vehicle: profile.active_vehicle
          ? {
              id: profile.active_vehicle.id,
              make: profile.active_vehicle.make,
              model: profile.active_vehicle.model,
              plate_number: profile.active_vehicle.plate_number,
              color: profile.active_vehicle.color,
              brand: profile.active_vehicle.brand
                ? {
                    name: profile.active_vehicle.brand.name,
                    logo_url: profile.active_vehicle.brand.logo_url,
                  }
                : null,
            }
          : null,
        can_accept: profile.availability === 'AVAILABLE' && !current,
      })),
    };
  }

  async context(user_id: string, ride_id: string) {
    let trip = await this.read_owned(user_id, ride_id);
    const settings = await this.settings();
    if (trip.status === 'SEARCHING') {
      await this.dispatch(ride_id);
      trip = await this.read_owned(user_id, ride_id);
    }
    const is_driver = trip.driver?.user_id === user_id;
    const driver_has_active_trip =
      is_driver && (active(trip.status) || trip.has_active_trip);
    const verification = trip.start_verification;
    const current_challenge =
      verification &&
      verification.driver_id === trip.driver_id &&
      verification.assignment_at.getTime() === trip.matched_at?.getTime();
    const code_available =
      current_challenge &&
      trip.status === 'DRIVER_WAITING' &&
      verification.expires_at > new Date() &&
      verification.attempts < 5;
    const upi =
      trip.payment?.recipient_upi ??
      (trip.driver
        ? await findApprovedDriverUpi(this.postgres, trip.driver.user_id)
        : null);
    const contact = is_driver ? trip.rider : trip.driver?.user;
    const policy = payment_policy(trip);
    const manageable_payment =
      !trip.payment ||
      (['PENDING', 'FAILED'].includes(trip.payment.status) &&
        !trip.payment.provider &&
        !trip.payment.provider_payment_id);
    const pending_wallet_choice = awaiting_wallet(trip);
    const wallet_active =
      manageable_payment &&
      wallet_available_for(trip) &&
      (trip.rider_id === user_id || pending_wallet_choice) &&
      trip.wallet_enabled === true;
    const wallet_selected = wallet_active && pending_wallet_choice;
    const wallet_enabled = trip.rider_id === user_id && wallet_active;
    const show_wallet_balance =
      trip.rider_id === user_id && wallet_available_for(trip);
    const free_wait_minutes =
      typeof policy.free_pickup_wait_minutes === 'number'
        ? policy.free_pickup_wait_minutes
        : 5;
    const no_show_contact_attempted =
      is_driver && trip.status === 'DRIVER_WAITING' && trip.contact_attempted;
    return {
      ride_id,
      collection_preference: trip.collection_preference,
      direct_collection_allowed:
        trip.status === 'COMPLETED' &&
        !(is_driver && wallet_selected) &&
        manageable_payment,
      status: trip.status,
      trip: {
        id: trip.id,
        status: trip.status,
        pickup_address: trip.pickup_address,
        pickup_latitude: trip.pickup_latitude,
        pickup_longitude: trip.pickup_longitude,
        dropoff_address: trip.dropoff_address,
        dropoff_latitude: trip.dropoff_latitude,
        dropoff_longitude: trip.dropoff_longitude,
        estimated_fare: trip.estimated_fare,
        final_fare: trip.final_fare,
        currency: trip.currency,
        requested_at: trip.requested_at,
        created_at: trip.created_at,
        passenger_count: trip.passenger_count,
        rider_note: trip.rider_note,
        cancel_reason: trip.cancel_reason,
        estimated_distance_m: trip.estimated_distance_m,
        estimated_duration_s: trip.estimated_duration_s,
        actual_distance_m: trip.actual_distance_m,
        actual_duration_s: trip.actual_duration_s,
        vehicle: trip.vehicle,
        driver: trip.driver
          ? {
              id: trip.driver.id,
              user_id: trip.driver.user_id,
              rating_average: trip.driver.rating_average,
              ratings_count: trip.driver.ratings_count,
              user: {
                id: trip.driver.user.id,
                first_name: trip.driver.user.first_name,
                last_name: trip.driver.user.last_name,
                avatar_url: trip.driver.user.avatar_url,
              },
            }
          : null,
        route: trip.route,
        quote: trip.quotes[0] ?? null,
        events: trip.events ? [...trip.events].reverse() : [],
        review:
          trip.reviews?.find((review) => review.reviewer_id === user_id) ??
          null,
        matched_at: trip.matched_at,
        arrived_at: trip.arrived_at,
        started_at: trip.started_at,
        completed_at: trip.completed_at,
        cancelled_at: trip.cancelled_at,
        rider: {
          id: trip.rider.id,
          first_name: trip.rider.first_name,
          last_name: trip.rider.last_name,
          avatar_url: trip.rider.avatar_url,
        },
      },
      server_time: new Date(),
      search_radius_km: trip.search_radius_km,
      settings,
      is_driver,
      driver_availability: trip.driver?.availability ?? null,
      driver_has_active_trip,
      free_wait_minutes,
      no_show_after: trip.arrived_at
        ? new Date(trip.arrived_at.getTime() + free_wait_minutes * 60000)
        : null,
      no_show_contact_attempted,
      start: {
        code:
          !is_driver && code_available
            ? reveal_trip_code(verification.code_ciphertext)
            : null,
        expires_at: current_challenge ? verification.expires_at : null,
        rider_confirmed: !!(
          current_challenge && verification.rider_confirmed_at
        ),
        driver_verified: !!(
          current_challenge && verification.driver_verified_at
        ),
        locked: !!(current_challenge && verification.attempts >= 5),
      },
      driver_location_fresh:
        !!trip.driver?.last_location_at &&
        trip.driver.last_location_accuracy_m !== null &&
        trip.driver.last_location_accuracy_m >= 0 &&
        trip.driver.last_location_accuracy_m <= settings.arrival_radius_m &&
        Date.now() - trip.driver.last_location_at.getTime() >= -10000 &&
        Date.now() - trip.driver.last_location_at.getTime() <=
          settings.location_max_age_s * 1000,
      driver_location:
        !is_driver &&
        active(trip.status) &&
        trip.driver?.current_latitude &&
        trip.driver.current_longitude
          ? {
              latitude: trip.driver.current_latitude,
              longitude: trip.driver.current_longitude,
              captured_at: trip.driver.last_location_at,
              accuracy_m: trip.driver.last_location_accuracy_m,
            }
          : null,
      search_deadline: trip.requested_at
        ? new Date(
            trip.requested_at.getTime() + settings.search_timeout_s * 1000,
          )
        : null,
      cancellation: {
        free_until: trip.matched_at
          ? new Date(
              trip.matched_at.getTime() +
                (typeof policy.free_cancellation_minutes === 'number'
                  ? policy.free_cancellation_minutes
                  : 2) *
                  60000,
            )
          : null,
        maximum_proposed_fee: trip.driver_id
          ? Decimal.min(
              (trip.estimated_fare ?? new Decimal(0))
                .mul(
                  typeof policy.cancellation_fee_percent === 'number'
                    ? policy.cancellation_fee_percent
                    : 0,
                )
                .div(100),
              typeof policy.maximum_cancellation_fee === 'number'
                ? policy.maximum_cancellation_fee
                : 0,
            ).toDecimalPlaces(2)
          : new Decimal(0),
        requires_review: true,
      },
      contact:
        contact && active(trip.status)
          ? {
              name: [contact.first_name, contact.last_name]
                .filter(Boolean)
                .join(' '),
              phone: contact.phone_e164,
            }
          : null,
      masked_calling_available: false,
      arrived_at: trip.arrived_at,
      payment: trip.payment
        ? {
            id: trip.payment.id,
            status: trip.payment.status,
            amount: trip.payment.amount,
            provider_managed:
              !!trip.payment.provider || !!trip.payment.provider_payment_id,
            razorpay_checkout: trip.payment.provider === 'razorpay-ride',
            method:
              manageable_payment &&
              trip.payment.collection_method === 'WALLET' &&
              !wallet_selected
                ? null
                : trip.payment.collection_method,
            recipient_upi: trip.payment.recipient_upi,
            unpaid_reason: trip.payment.unpaid_reason,
          }
        : null,
      payment_options: {
        cash: policy.cash_enabled !== false,
        upi: policy.direct_upi_enabled === true && !!upi,
        razorpay_upi:
          trip.rider_id === user_id &&
          wallet_available_for(trip) &&
          (trip.payment?.provider === 'razorpay-ride' ||
            (manageable_payment &&
              policy.direct_upi_enabled === true &&
              trip.razorpay_upi_enabled === true &&
              gateway_credential_mode() === 'live')),
        wallet: wallet_enabled,
        wallet_available_paise: show_wallet_balance
          ? (trip.wallet_available ?? '0')
          : null,
        upi_handle: trip.status === 'COMPLETED' ? upi : null,
      },
      wallet_payment_selected: wallet_selected,
      review_payment_upi:
        trip.settlement_review?.status === 'APPROVED' &&
        trip.settlement_review.fee_amount.gt(0) &&
        trip.settlement_review.kind !== 'UNPAID'
          ? upi
          : null,
      review: trip.settlement_review,
    };
  }

  private verify_start_eligibility(trip: Trip) {
    if (
      !trip.driver ||
      trip.driver.verification_status !== 'VERIFIED' ||
      trip.driver.user.status !== 'ACTIVE' ||
      trip.driver.availability === 'SUSPENDED' ||
      (trip.driver.active_vehicle?.capacity ?? 0) <
        (trip.passenger_count ?? 1) ||
      !is_vehicle_eligible(
        trip.driver.active_vehicle,
        trip.quotes[0],
        trip.driver.id,
      )
    )
      throw new AppError(
        409,
        'DRIVER_NO_LONGER_ELIGIBLE',
        'The assigned driver or vehicle is no longer eligible. Contact support or cancel this ride.',
      );
  }

  private writeTrip<T>(
    userId: string,
    rideId: string,
    driverOnly: boolean,
    action: (tx: SqlClient, trip: Trip) => Promise<T>,
  ) {
    return writeRideAccess(
      this.postgres,
      rideId,
      userId,
      async (tx) => action(tx, await this.read_owned(userId, rideId, tx)),
      driverOnly,
    );
  }

  async arrive(user_id: string, ride_id: string) {
    const settings = await this.settings();
    await this.writeTrip(user_id, ride_id, true, async (tx, trip) => {
      if (trip.status === 'DRIVER_WAITING' || trip.status === 'IN_PROGRESS')
        return;
      if (!['DRIVER_ASSIGNED', 'DRIVER_ARRIVING'].includes(trip.status))
        throw new AppError(
          409,
          'RIDE_STATE_INVALID',
          'This ride is not travelling to pickup.',
        );
      this.verify_start_eligibility(trip);
      const driver = trip.driver!;
      if (
        !driver.last_location_at ||
        Date.now() - driver.last_location_at.getTime() >
          settings.location_max_age_s * 1000 ||
        driver.last_location_accuracy_m === null ||
        driver.last_location_accuracy_m > settings.arrival_radius_m ||
        driver.current_latitude === null ||
        driver.current_longitude === null
      )
        throw new AppError(
          409,
          'FRESH_LOCATION_REQUIRED',
          'Wait for an accurate, fresh GPS fix before marking arrived.',
        );
      const distance = trip_distance_m(
        Number(driver.current_latitude),
        Number(driver.current_longitude),
        Number(trip.pickup_latitude),
        Number(trip.pickup_longitude),
      );
      if (distance > settings.arrival_radius_m)
        throw new AppError(
          409,
          'OUTSIDE_PICKUP_RADIUS',
          `Reach within ${settings.arrival_radius_m} metres of pickup before marking arrived.`,
        );
      await tx.query(
        `UPDATE rides SET status='DRIVER_WAITING',arrived_at=statement_timestamp(),
          updated_at=clock_timestamp() WHERE id=$1`,
        [ride_id],
      );
      await resetTripVerification(tx, ride_id, driver.id, trip.matched_at!);
      await recordTripEvent(tx, ride_id, user_id, 'DRIVER_WAITING', {
        distance_m: Math.round(distance),
        gps_verified: true,
        arrival_radius_m: settings.arrival_radius_m,
        accuracy_m: driver.last_location_accuracy_m,
      });
      await notifyTripParticipant(
        tx,
        trip.rider_id,
        ride_id,
        'Your driver has arrived',
        'Your driver is at pickup. Confirm the ride and share the trip code when you are ready.',
      );
    });
    return this.context(user_id, ride_id);
  }

  async refresh_code(user_id: string, ride_id: string) {
    await this.writeTrip(user_id, ride_id, false, async (tx, trip) => {
      if (trip.rider_id !== user_id || trip.status !== 'DRIVER_WAITING')
        throw new AppError(
          409,
          'RIDE_STATE_INVALID',
          'Only the rider can refresh a code while waiting at pickup.',
        );
      if (
        trip.start_verification &&
        trip.start_verification.expires_at > new Date()
      )
        throw new AppError(
          429,
          'TRIP_CODE_ACTIVE',
          'Wait until the current code expires before requesting a new one.',
        );
      await resetTripVerification(
        tx,
        ride_id,
        trip.driver_id!,
        trip.matched_at!,
      );
      await recordTripEvent(tx, ride_id, user_id, 'TRIP_CODE_REFRESHED');
    });
    return this.context(user_id, ride_id);
  }

  async start_proof(user_id: string, ride_id: string, code?: string) {
    const result = await this.writeTrip(
      user_id,
      ride_id,
      code !== undefined,
      async (tx, trip) => {
        if (trip.status === 'IN_PROGRESS') return { started: true };
        if (trip.status !== 'DRIVER_WAITING')
          throw new AppError(
            409,
            'RIDE_STATE_INVALID',
            'The driver must arrive before start verification.',
          );
        if (code === undefined && trip.rider_id !== user_id)
          throw new AppError(
            403,
            'RIDER_CONFIRMATION_REQUIRED',
            'Only the rider can confirm this trip.',
          );
        const v = trip.start_verification;
        if (
          !v ||
          v.driver_id !== trip.driver_id ||
          v.assignment_at.getTime() !== trip.matched_at?.getTime() ||
          v.expires_at <= new Date()
        )
          throw new AppError(
            409,
            'TRIP_CODE_EXPIRED',
            'The rider must request a fresh trip code.',
          );
        if (v.attempts >= 5)
          throw new AppError(
            429,
            'TRIP_CODE_LOCKED',
            'Too many incorrect attempts. Wait for expiry and ask the rider for a fresh code.',
          );
        this.verify_start_eligibility(trip);
        if (
          code !== undefined &&
          !v.driver_verified_at &&
          !matches_trip_code(ride_id, code, v.code_hash)
        ) {
          await tx.query(
            'UPDATE ride_start_verifications SET attempts=attempts+1,updated_at=clock_timestamp() WHERE ride_id=$1',
            [ride_id],
          );
          return { error: 'TRIP_CODE_INVALID' as const };
        }
        const {
          rows: [saved],
        } = await tx.query<{
          rider_confirmed_at: Date | null;
          driver_verified_at: Date | null;
        }>(
          `UPDATE ride_start_verifications SET
          rider_confirmed_at=CASE WHEN $2::boolean THEN COALESCE(rider_confirmed_at,statement_timestamp()) ELSE rider_confirmed_at END,
          driver_verified_at=CASE WHEN $2::boolean THEN driver_verified_at ELSE COALESCE(driver_verified_at,statement_timestamp()) END,
          updated_at=clock_timestamp() WHERE ride_id=$1 RETURNING rider_confirmed_at,driver_verified_at`,
          [ride_id, code === undefined],
        );
        const started = Boolean(
          saved?.rider_confirmed_at && saved.driver_verified_at,
        );
        if (started) {
          await tx.query(
            `UPDATE rides SET status='IN_PROGRESS',started_at=statement_timestamp(),
            updated_at=clock_timestamp() WHERE id=$1`,
            [ride_id],
          );
          await tx.query(
            "UPDATE driver_profiles SET availability='ON_TRIP',updated_at=clock_timestamp() WHERE id=$1",
            [trip.driver_id],
          );
          await tx.query(
            `UPDATE ride_start_verifications SET used_at=statement_timestamp(),code_ciphertext='',code_hash='',
            updated_at=clock_timestamp() WHERE ride_id=$1`,
            [ride_id],
          );
          await recordTripEvent(tx, ride_id, user_id, 'TRIP_STARTED', {
            rider_confirmed: true,
            driver_verified: true,
          });
          await notifyTripParticipant(
            tx,
            trip.rider_id,
            ride_id,
            'Ride started',
            'Your ride has started after both start checks were completed.',
          );
        }
        return { started };
      },
    );
    if ('error' in result)
      throw new AppError(422, result.error!, 'The trip code is incorrect.');
    return this.context(user_id, ride_id);
  }

  async complete(user_id: string, ride_id: string) {
    await this.writeTrip(user_id, ride_id, true, async (tx, trip) => {
      if (trip.status === 'COMPLETED') return;
      if (
        trip.status !== 'IN_PROGRESS' ||
        !trip.started_at ||
        !trip.estimated_fare
      )
        throw new AppError(
          409,
          'RIDE_STATE_INVALID',
          'Only an ongoing ride can be completed.',
        );
      const { rows: points } = await tx.query<{
        latitude: string;
        longitude: string;
        recorded_at: Date;
      }>(
        `SELECT latitude,longitude,recorded_at FROM ride_locations WHERE ride_id=$1 AND recorded_at >= $2
          ORDER BY recorded_at,id LIMIT 10000`,
        [ride_id, trip.started_at],
      );
      let distance = 0;
      let validSegments = 0;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!,
          b = points[i]!;
        const segment = trip_distance_m(
          Number(a.latitude),
          Number(a.longitude),
          Number(b.latitude),
          Number(b.longitude),
        );
        if (
          segment /
            Math.max(
              1,
              (b.recorded_at.getTime() - a.recorded_at.getTime()) / 1000,
            ) <
          60
        ) {
          distance += segment;
          validSegments++;
        }
      }
      const finalFare = trip.estimated_fare.toString();
      await tx.query(
        `UPDATE rides SET status='COMPLETED',completed_at=statement_timestamp(),final_fare=$2,
          actual_duration_s=$3,actual_distance_m=$4,updated_at=clock_timestamp() WHERE id=$1`,
        [
          ride_id,
          finalFare,
          Math.max(
            1,
            Math.round((Date.now() - trip.started_at.getTime()) / 1000),
          ),
          validSegments ? Math.round(distance) : null,
        ],
      );
      await tx.query(
        `INSERT INTO payments (id,ride_id,amount,currency,status,updated_at)
          VALUES ($1,$2,$3,$4,'PENDING',clock_timestamp()) ON CONFLICT(ride_id) DO NOTHING`,
        [nextEntityId(), ride_id, finalFare, trip.currency],
      );
      await tx.query(
        `UPDATE driver_profiles SET completed_rides=completed_rides+1,availability=$2,
          updated_at=clock_timestamp() WHERE id=$1`,
        [trip.driver_id, availability_after_trip(trip.driver!)],
      );
      await recordTripEvent(tx, ride_id, user_id, 'TRIP_COMPLETED', {
        fare_source: 'ACCEPTED_QUOTE',
      });
      await notifyTripParticipant(
        tx,
        trip.rider_id,
        ride_id,
        'Ride completed',
        'Choose an available method to pay the displayed fare.',
      );
      await insertUserLog(tx, {
        actor_id: user_id,
        entity_type: 'Ride',
        entity_id: ride_id,
        action: 'COMPLETE_OPERATIONAL_TRIP',
        after_data: { final_fare: finalFare },
      });
    });
    return this.context(user_id, ride_id);
  }

  async payment(
    user_id: string,
    ride_id: string,
    method: 'CASH' | 'UPI' | 'WALLET',
    receipt?: { received: boolean; reason?: string },
  ) {
    await this.writeTrip(user_id, ride_id, !!receipt, async (tx, trip) => {
      if (trip.status !== 'COMPLETED' || !trip.final_fare || !trip.driver)
        throw new AppError(
          409,
          'PAYMENT_RIDE_STATE_INVALID',
          'Complete this ride before recording payment.',
        );
      if (trip.payment?.status === 'CAPTURED') return;
      if (trip.payment?.status === 'CANCELLED')
        throw new AppError(
          409,
          'FARE_WAIVED',
          'This fare obligation has been waived by an administrator.',
        );
      if (
        trip.payment &&
        (['AUTHORIZED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(
          trip.payment.status,
        ) ||
          trip.payment.provider ||
          trip.payment.provider_payment_id)
      )
        throw new AppError(
          409,
          'PAYMENT_REVIEW_REQUIRED',
          'This payment is managed or already resolved through another payment flow. Contact Support.',
        );
      const wallet_selected = awaiting_wallet(trip);
      const check_wallet =
        (method === 'WALLET' || (!!receipt && wallet_selected)) &&
        wallet_available_for(trip);
      if (check_wallet)
        await tx.query('SELECT pg_advisory_xact_lock_shared($1::int)', [
          payout_schedule_lock,
        ]);
      const wallet_active =
        check_wallet &&
        (
          await tx.query<{ wallet_ride_collection_enabled: boolean }>(
            "SELECT wallet_ride_collection_enabled FROM payout_schedules WHERE id='default'",
          )
        ).rows[0]?.wallet_ride_collection_enabled === true;
      if (receipt && wallet_active && wallet_selected)
        throw new AppError(
          409,
          'WALLET_PAYMENT_SELECTED',
          'The rider selected Wallet. Wait for confirmation or ask the rider to change the payment method.',
        );
      if (method === 'WALLET') {
        if (receipt || trip.rider_id !== user_id || !wallet_active)
          throw new AppError(
            409,
            'WALLET_UNAVAILABLE',
            'Wallet payment is unavailable for this ride.',
          );
        await tx.query(
          `INSERT INTO payments (id,ride_id,amount,currency,collection_method,status,updated_at)
            VALUES ($1,$2,$3,$4,'WALLET','PENDING',clock_timestamp())
            ON CONFLICT(ride_id) DO UPDATE SET collection_method='WALLET',status='PENDING',
              recipient_upi=NULL,failed_at=NULL,updated_at=clock_timestamp()`,
          [nextEntityId(), ride_id, trip.final_fare.toString(), trip.currency],
        );
        return;
      }
      require_supported_ride_payment(trip.quotes[0]?.category_snapshot, method);
      const upi =
        method === 'UPI'
          ? (trip.payment?.recipient_upi ??
            (await findApprovedDriverUpi(tx, trip.driver.user_id)))
          : null;
      if (method === 'UPI' && !upi)
        throw new AppError(
          409,
          'DRIVER_UPI_NOT_CONFIGURED',
          'The driver has no uniquely approved UPI account. Use enabled cash payment or contact support.',
        );
      const paid = receipt?.received === true;
      const {
        rows: [recorded],
      } = await tx.query<{ id: string }>(
        `INSERT INTO payments (id,ride_id,amount,currency,collection_method,recipient_upi,status,
            confirmed_by_id,paid_at,unpaid_reason,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp())
          ON CONFLICT(ride_id) DO UPDATE SET collection_method=EXCLUDED.collection_method,
            recipient_upi=EXCLUDED.recipient_upi,status=EXCLUDED.status,confirmed_by_id=EXCLUDED.confirmed_by_id,
            paid_at=EXCLUDED.paid_at,updated_at=clock_timestamp(),
            unpaid_reason=CASE WHEN $11::boolean THEN EXCLUDED.unpaid_reason ELSE payments.unpaid_reason END
          RETURNING id`,
        [
          nextEntityId(),
          ride_id,
          trip.final_fare.toString(),
          trip.currency,
          method,
          upi,
          paid ? 'CAPTURED' : 'PENDING',
          paid ? user_id : null,
          paid ? new Date() : null,
          receipt?.received === false ? (receipt.reason ?? null) : null,
          !!receipt && (receipt.received || receipt.reason !== undefined),
        ],
      );
      if (!recorded) throw new Error('Ride collection returned no payment');
      if (
        paid &&
        method === 'CASH' &&
        trip.currency === 'INR' &&
        trip.final_fare.gt(0)
      ) {
        await record_cash_ride(tx, {
          ride_id,
          payment_id: recorded.id,
          rider_id: trip.rider_id,
          driver_user_id: trip.driver.user_id,
          fare: trip.final_fare,
          snapshot: trip.quotes[0]?.category_snapshot,
        });
      }
      if (paid)
        await tx.query(
          `UPDATE ride_settlement_reviews SET status='SETTLED',resolved_by_id=$2,
            resolution_note='The assigned driver confirmed receipt of the full fare.',
            version=version+1,updated_at=clock_timestamp()
            WHERE ride_id=$1 AND kind='UNPAID' AND status IN ('REQUESTED','DISPUTED','APPROVED')`,
          [ride_id, user_id],
        );
      if (receipt?.received === false)
        await tx.query(
          `INSERT INTO ride_settlement_reviews (id,ride_id,reported_by_id,driver_id,kind,reason,fee_amount,updated_at)
            VALUES ($1,$2,$3,$4,'UNPAID',$5,$6,clock_timestamp()) ON CONFLICT(ride_id) DO NOTHING`,
          [
            nextEntityId(),
            ride_id,
            user_id,
            trip.driver_id,
            receipt.reason,
            trip.final_fare.toString(),
          ],
        );
      await recordTripEvent(
        tx,
        ride_id,
        user_id,
        receipt
          ? paid
            ? 'COLLECTION_CONFIRMED'
            : 'FARE_UNPAID_REPORTED'
          : 'PAYMENT_METHOD_SELECTED',
        { method, received: paid },
      );
      await insertUserLog(tx, {
        actor_id: user_id,
        entity_type: 'Payment',
        entity_id: ride_id,
        action: receipt ? 'DRIVER_COLLECTION_REPORT' : 'SELECT_DIRECT_PAYMENT',
        after_data: { method, received: paid },
      });
      if (paid)
        await notifyTripParticipant(
          tx,
          trip.rider_id,
          ride_id,
          'Payment received',
          'Your driver confirmed receipt of the full fare.',
        );
    });
    return this.context(user_id, ride_id);
  }

  async navigation(
    user_id: string,
    ride_id: string,
    latitude: number,
    longitude: number,
  ) {
    const trip = await readRideAccess(this.postgres, ride_id, user_id);
    if (trip.driver_user_id !== user_id || !active(trip.status))
      throw new AppError(
        403,
        'TRIP_NAVIGATION_UNAVAILABLE',
        'Navigation is available only to the assigned driver during the trip.',
      );
    const destination = trip.status === 'IN_PROGRESS';
    const route = await this.routing.driving_route(
      {
        from_latitude: latitude,
        from_longitude: longitude,
        to_latitude: Number(
          destination ? trip.dropoff_latitude : trip.pickup_latitude,
        ),
        to_longitude: Number(
          destination ? trip.dropoff_longitude : trip.pickup_longitude,
        ),
      },
      true,
    );
    return { ...route, target: destination ? 'DROPOFF' : 'PICKUP' };
  }

  async rider_route(user_id: string, ride_id: string) {
    const trip = await readRideAccess(this.postgres, ride_id, user_id);
    if (trip.rider_id !== user_id || !active(trip.status))
      throw new AppError(
        403,
        'RIDER_ROUTE_UNAVAILABLE',
        'Route progress is available only to the rider during an assigned trip.',
      );
    const settings = await this.settings();
    const driver = trip;
    if (
      !driver?.current_latitude ||
      !driver.current_longitude ||
      !driver.last_location_at ||
      driver.last_location_accuracy_m === null ||
      driver.last_location_accuracy_m < 0 ||
      driver.last_location_accuracy_m > settings.arrival_radius_m ||
      Date.now() - driver.last_location_at.getTime() < -10000 ||
      Date.now() - driver.last_location_at.getTime() >
        settings.location_max_age_s * 1000
    )
      throw new AppError(
        409,
        'DRIVER_LOCATION_STALE',
        'Waiting for a fresh, precise driver location. Contact the driver or Support if needed.',
      );
    const target = trip.status === 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP';
    const route = await this.routing.driving_route({
      from_latitude: Number(driver.current_latitude),
      from_longitude: Number(driver.current_longitude),
      to_latitude: Number(
        target === 'DROPOFF' ? trip.dropoff_latitude : trip.pickup_latitude,
      ),
      to_longitude: Number(
        target === 'DROPOFF' ? trip.dropoff_longitude : trip.pickup_longitude,
      ),
    });
    if (
      Date.now() - driver.last_location_at.getTime() >
      settings.location_max_age_s * 1000
    )
      throw new AppError(
        409,
        'DRIVER_LOCATION_STALE',
        'The driver location expired while loading the route. Please refresh.',
      );
    return {
      ...route,
      target,
      captured_at: driver.last_location_at,
      calculated_at: new Date(),
    };
  }

  async messages(user_id: string, ride_id: string) {
    return this.postgres.transaction(async (tx) => {
      await readRideAccess(tx, ride_id, user_id);
      const { rows } = await tx.query(
        `SELECT id,sender_id,body,created_at,client_key FROM ride_messages WHERE ride_id=$1
          ORDER BY created_at DESC,id DESC LIMIT 100`,
        [ride_id],
      );
      return rows.reverse();
    }, 'REPEATABLE READ');
  }

  async send_message(
    user_id: string,
    ride_id: string,
    body: string,
    client_key: string,
  ) {
    return writeRideAccess(
      this.postgres,
      ride_id,
      user_id,
      async (tx, trip) => {
        if (!allowsTripContact(trip))
          throw new AppError(
            409,
            'TRIP_CHAT_CLOSED',
            'Trip chat is available only while the ride is active.',
          );
        const {
          rows: [existing],
        } = await tx.query<{ id: string; body: string }>(
          'SELECT id,body FROM ride_messages WHERE ride_id=$1 AND sender_id=$2 AND client_key=$3',
          [ride_id, user_id, client_key],
        );
        if (existing) {
          if (existing.body !== body)
            throw new AppError(
              409,
              'MESSAGE_RETRY_CONFLICT',
              'This message retry changed.',
            );
          return { id: existing.id };
        }
        const {
          rows: [recent],
        } = await tx.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM ride_messages WHERE ride_id=$1 AND sender_id=$2
          AND created_at>=$3`,
          [ride_id, user_id, new Date(Date.now() - 10000)],
        );
        if ((recent?.total ?? 0) >= 5)
          throw new AppError(
            429,
            'TRIP_CHAT_RATE_LIMIT',
            'Wait a moment before sending another message.',
          );
        const id = nextEntityId();
        await tx.query(
          `INSERT INTO ride_messages (id,ride_id,sender_id,client_key,body,updated_at)
          VALUES ($1,$2,$3,$4,$5,clock_timestamp())`,
          [id, ride_id, user_id, client_key, body],
        );
        return { id };
      },
    );
  }

  async contact_attempt(user_id: string, ride_id: string) {
    return writeRideAccess(
      this.postgres,
      ride_id,
      user_id,
      async (tx, trip) => {
        if (!allowsTripContact(trip))
          throw new AppError(
            409,
            'TRIP_CONTACT_CLOSED',
            'Calling is available only while the trip is active.',
          );
        const phone =
          trip.rider_id === user_id ? trip.driver_phone : trip.rider_phone;
        if (!phone)
          throw new AppError(
            409,
            'CONTACT_PHONE_UNAVAILABLE',
            'The other person has no available phone number. Use trip chat or Support.',
          );
        await tx.query(
          `INSERT INTO ride_events (id,ride_id,actor_id,event_type,metadata,updated_at)
          VALUES ($1,$2,$3,'CALL_ATTEMPT','{"connection_verified":false}'::jsonb,clock_timestamp())`,
          [nextEntityId(), ride_id, user_id],
        );
        return { phone };
      },
    );
  }

  async report_issue(
    user_id: string,
    ride_id: string,
    kind: 'CANCELLATION' | 'NO_SHOW',
    reason: string,
    reason_code?: string,
  ) {
    const settings = await this.settings();
    await this.writeTrip(user_id, ride_id, false, async (tx, trip) => {
      if (trip.status === 'CANCELLED' || trip.settlement_review) return;
      if (
        !['DRAFT', 'REQUESTED', 'SEARCHING', ...ACTIVE_TRIP].includes(
          trip.status,
        ) ||
        trip.status === 'IN_PROGRESS'
      )
        throw new AppError(
          409,
          'RIDE_STATE_INVALID',
          'This ride cannot be reported as a pickup cancellation.',
        );
      const driver = trip.driver?.user_id === user_id;
      const policy = payment_policy(trip);
      let amount = new Decimal(0);
      if (kind === 'NO_SHOW') {
        if (!driver || trip.status !== 'DRIVER_WAITING' || !trip.arrived_at)
          throw new AppError(
            409,
            'ARRIVAL_REQUIRED',
            'Only an arrived driver can report passenger no-show.',
          );
        const wait =
          typeof policy.free_pickup_wait_minutes === 'number'
            ? policy.free_pickup_wait_minutes
            : 5;
        if (Date.now() - trip.arrived_at.getTime() < wait * 60000)
          throw new AppError(
            409,
            'WAITING_PERIOD_ACTIVE',
            'The free pickup waiting period has not ended.',
          );
        const {
          rows: [arrival],
        } = await tx.query<{ metadata: JsonValue }>(
          `SELECT metadata FROM ride_events WHERE ride_id=$1 AND actor_id=$2 AND event_type='DRIVER_WAITING'
            ORDER BY created_at DESC,id DESC LIMIT 1`,
          [ride_id, user_id],
        );
        if (
          !trip.contact_attempted ||
          object(arrival?.metadata).gps_verified !== true
        )
          throw new AppError(
            409,
            'NO_SHOW_EVIDENCE_REQUIRED',
            'A GPS-verified arrival and a call attempt after arrival are required.',
          );
        const d = trip.driver!;
        if (
          !d.last_location_at ||
          d.last_location_accuracy_m === null ||
          d.last_location_accuracy_m > settings.arrival_radius_m ||
          Date.now() - d.last_location_at.getTime() >
            settings.location_max_age_s * 1000 ||
          !d.current_latitude ||
          !d.current_longitude ||
          trip_distance_m(
            Number(d.current_latitude),
            Number(d.current_longitude),
            Number(trip.pickup_latitude),
            Number(trip.pickup_longitude),
          ) > settings.arrival_radius_m
        )
          throw new AppError(
            409,
            'PICKUP_LOCATION_REQUIRED',
            'Remain at pickup with a fresh location to report no-show.',
          );
      }
      const free =
        typeof policy.free_cancellation_minutes === 'number'
          ? policy.free_cancellation_minutes
          : 2;
      if (
        kind === 'NO_SHOW' ||
        (!driver &&
          trip.matched_at &&
          Date.now() - trip.matched_at.getTime() > free * 60000)
      ) {
        const percent =
          typeof policy.cancellation_fee_percent === 'number'
            ? policy.cancellation_fee_percent
            : 0;
        const cap =
          typeof policy.maximum_cancellation_fee === 'number'
            ? policy.maximum_cancellation_fee
            : 0;
        amount = Decimal.min(
          (trip.estimated_fare ?? new Decimal(0)).mul(percent).div(100),
          cap,
        ).toDecimalPlaces(2);
      }
      if (trip.driver_id)
        await tx.query(
          `INSERT INTO ride_settlement_reviews (id,ride_id,reported_by_id,driver_id,kind,reason,
            fee_amount,status,resolution_note,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp())`,
          [
            nextEntityId(),
            ride_id,
            user_id,
            trip.driver_id,
            kind,
            reason,
            amount.toString(),
            !driver && amount.isZero() ? 'WAIVED' : 'REQUESTED',
            amount.isZero()
              ? 'No passenger fee is due. Any driver conduct concern remains available in the trip audit.'
              : null,
          ],
        );
      await tx.query(
        `UPDATE rides SET status='CANCELLED',cancelled_at=statement_timestamp(),
          cancel_reason=$2,updated_at=clock_timestamp() WHERE id=$1`,
        [ride_id, reason],
      );
      await tx.query(
        `UPDATE ride_offers SET status='CANCELLED',responded_at=statement_timestamp(),updated_at=clock_timestamp()
          WHERE ride_id=$1 AND status IN ('SENT','ACCEPTED')`,
        [ride_id],
      );
      if (trip.driver)
        await tx.query(
          'UPDATE driver_profiles SET availability=$2,updated_at=clock_timestamp() WHERE id=$1',
          [trip.driver.id, availability_after_trip(trip.driver)],
        );
      await tx.query('DELETE FROM ride_start_verifications WHERE ride_id=$1', [
        ride_id,
      ]);
      await recordTripEvent(
        tx,
        ride_id,
        user_id,
        kind === 'NO_SHOW'
          ? 'PASSENGER_NO_SHOW_REPORTED'
          : 'CANCELLATION_REPORTED',
        { review_required: true, reason_code: reason_code ?? 'OTHER' },
      );
      await notifyTripParticipant(
        tx,
        trip.rider_id,
        ride_id,
        'Ride cancelled',
        'The trip ended. Any proposed charge requires admin review and can be disputed.',
      );
    });
    return this.context(user_id, ride_id);
  }
  async dispute(user_id: string, ride_id: string, reason: string) {
    await this.writeTrip(user_id, ride_id, false, async (tx, trip) => {
      if (
        !trip.settlement_review ||
        ['WAIVED', 'REJECTED', 'SETTLED'].includes(
          trip.settlement_review.status,
        )
      )
        throw new AppError(
          409,
          'REVIEW_NOT_DISPUTABLE',
          'No open charge is available to dispute.',
        );
      await tx.query(
        `UPDATE ride_settlement_reviews SET status='DISPUTED',dispute_reason=$2,
          version=version+1,updated_at=clock_timestamp() WHERE ride_id=$1`,
        [ride_id, reason],
      );
      await recordTripEvent(tx, ride_id, user_id, 'CHARGE_DISPUTED');
    });
    return this.context(user_id, ride_id);
  }
  async reviews(status?: string, page = 1) {
    const pageSize = 20;
    const statuses = !status
      ? null
      : status === 'PENDING'
        ? pending_review_statuses
        : [status];
    return this.postgres.transaction(async (tx) => {
      const {
        rows: [count],
      } = await tx.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM ride_settlement_reviews WHERE $1::text[] IS NULL OR status=ANY($1)',
        [statuses],
      );
      const total = count?.total ?? 0;
      const currentPage = Math.min(
        page,
        Math.max(1, Math.ceil(total / pageSize)),
      );
      const { rows: items } = await tx.query(settlementReviewsPage, [
        statuses,
        pageSize,
        (currentPage - 1) * pageSize,
      ]);
      return { items, total, page: currentPage, page_size: pageSize };
    }, 'REPEATABLE READ');
  }
  async review(
    actor_id: string,
    id: string,
    input: {
      expected_version: number;
      status: 'APPROVED' | 'WAIVED' | 'REJECTED' | 'SETTLED';
      note: string;
    },
  ) {
    return this.postgres.transaction(
      async (tx) => {
        await requireActiveAdmin(tx, actor_id);
        const {
          rows: [initial],
        } = await tx.query<{ ride_id: string }>(
          'SELECT ride_id FROM ride_settlement_reviews WHERE id=$1',
          [id],
        );
        if (!initial)
          throw new AppError(
            404,
            'REVIEW_NOT_FOUND',
            'This review no longer exists.',
          );
        await tx.query('SELECT pg_advisory_xact_lock(720044,hashtext($1))', [
          initial.ride_id,
        ]);
        const {
          rows: [before],
        } = await tx.query<{
          ride_id: string;
          kind: string;
          version: number;
          status: string;
          fee_amount: string;
        }>(
          'SELECT s.*,trim_scale(s.fee_amount)::text AS fee_amount FROM ride_settlement_reviews s WHERE s.id=$1',
          [id],
        );
        if (!before)
          throw new AppError(
            404,
            'REVIEW_NOT_FOUND',
            'This review no longer exists.',
          );
        if (before.version !== input.expected_version)
          throw new AppError(
            409,
            'REVIEW_CONFLICT',
            'This review changed. Reload before saving.',
          );
        if (['WAIVED', 'REJECTED', 'SETTLED'].includes(before.status))
          throw new AppError(
            409,
            'REVIEW_CLOSED',
            'This review has already been resolved.',
          );
        if (input.status === 'SETTLED' && before.status !== 'APPROVED')
          throw new AppError(
            409,
            'APPROVAL_REQUIRED',
            'Approve the charge before recording manual settlement.',
          );
        if (before.kind === 'UNPAID' && input.status !== 'REJECTED') {
          const {
            rows: [payment],
          } = await tx.query<{
            status: string;
            provider: string | null;
            provider_payment_id: string | null;
          }>(
            'SELECT status,provider,provider_payment_id FROM payments WHERE ride_id=$1',
            [before.ride_id],
          );
          if (
            !payment ||
            !['PENDING', 'FAILED'].includes(payment.status) ||
            payment.provider ||
            payment.provider_payment_id
          )
            throw new AppError(
              409,
              'REVIEW_PAYMENT_STATE_CHANGED',
              'The payment is already resolved or managed through another flow. Refresh the review and verify its payment history before acting.',
            );
        }
        const {
          rows: [saved],
        } = await tx.query<{
          status: string;
          version: number;
          fee_amount: string;
        }>(
          `UPDATE ride_settlement_reviews s SET status=$2,resolution_note=$3,resolved_by_id=$4,
          version=version+1,updated_at=clock_timestamp() WHERE s.id=$1 AND s.version=$5
          RETURNING s.*,trim_scale(s.fee_amount)::text AS fee_amount`,
          [id, input.status, input.note, actor_id, input.expected_version],
        );
        if (!saved)
          throw new AppError(
            409,
            'REVIEW_CONFLICT',
            'This review changed. Reload before saving.',
          );
        if (before.kind === 'UNPAID' && input.status === 'WAIVED')
          await tx.query(
            `UPDATE payments SET status='CANCELLED',unpaid_reason=$2,updated_at=clock_timestamp() WHERE ride_id=$1`,
            [before.ride_id, input.note],
          );
        if (before.kind === 'UNPAID' && input.status === 'SETTLED')
          await tx.query(
            `UPDATE payments SET status='CAPTURED',paid_at=statement_timestamp(),confirmed_by_id=$2,
            unpaid_reason=NULL,updated_at=clock_timestamp() WHERE ride_id=$1`,
            [before.ride_id, actor_id],
          );
        await insertUserLog(tx, {
          actor_id,
          entity_type: 'RideSettlementReview',
          entity_id: id,
          action: 'REVIEW_TRIP_SETTLEMENT',
          before_data: before,
          after_data: saved,
        });
        return saved;
      },
      'READ COMMITTED',
      { checkoutMs: 10000, statementMs: 30000 },
    );
  }
}
