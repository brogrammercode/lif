import { pending_review_statuses } from '../admin_pending/pending.rules.js';
import {
  ride_person,
  admin_vehicle_select,
} from '../admin_user/admin_user.rides.js';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { TransactionClient } from '../../infra/database/client.js';
import {
  require_active_account,
  require_active_admin,
  require_driver_participation,
} from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import { GeocodeService } from '../geocode/geocode.service.js';
import {
  MATCHING_VEHICLE_INCLUDE,
  is_vehicle_eligible,
} from '../vehicle_category/vehicle_category.security.js';
import { availability_after_trip } from '../driver/driver_eligibility.js';
import { approved_driver_upi, approved_driver_upis } from './driver_payout.js';
import { require_supported_ride_payment } from '../app_configuration/payment_policy.js';
import { rider_vehicle_select } from '../ride/ride.presentation.js';
import {
  ACTIVE_TRIP,
  trip_distance_m,
  search_radius_km,
  new_trip_code,
  matches_trip_code,
  reveal_trip_code,
} from './trip.rules.js';

const options = { maxWait: 10000, timeout: 30000 };
const include = {
  rider: {
    select: { id: true, first_name: true, last_name: true, phone_e164: true },
  },
  driver: {
    include: {
      user: {
        select: {
          id: true,
          status: true,
          first_name: true,
          last_name: true,
          avatar_url: true,
          phone_e164: true,
        },
      },
      active_vehicle: { include: MATCHING_VEHICLE_INCLUDE },
    },
  },
  quotes: { where: { selected_at: { not: null } } },
  start_verification: true,
  payment: true,
  settlement_review: true,
  vehicle: { select: rider_vehicle_select },
  route: true,
  events: {
    select: { id: true, event_type: true, created_at: true },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: 200,
  },
  reviews: {
    select: { id: true, reviewer_id: true, score: true, comment: true },
  },
} satisfies Prisma.RideInclude;
type Trip = Prisma.RideGetPayload<{ include: typeof include }>;
const active = (status: string) =>
  (ACTIVE_TRIP as readonly string[]).includes(status);
const object = (v: Prisma.JsonValue | undefined) =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const payment_policy = (trip: Trip) =>
  object(object(trip.quotes[0]?.category_snapshot).payment_policy);
const notify = (
  tx: TransactionClient,
  user_id: string,
  ride_id: string,
  title: string,
  body: string,
) =>
  tx.notification.create({
    data: { user_id, type: 'RIDE_UPDATE', title, body, data: { ride_id } },
  });

@Injectable()
export class DriverOperationsService {
  constructor(
    private readonly database: PrismaService,
    private readonly routing: GeocodeService,
  ) {}

  async settings() {
    const row = await this.database.client.rideFarePolicy.findUnique({
      where: { key: 'default' },
    });
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

  private async owned(
    user_id: string,
    id: string,
    tx: TransactionClient = this.database.client,
  ): Promise<Trip> {
    const trip = await tx.ride.findFirst({
      where: { id, OR: [{ rider_id: user_id }, { driver: { user_id } }] },
      include,
    });
    if (!trip)
      throw new AppError(
        404,
        'RIDE_NOT_FOUND',
        'This trip is not available to your account.',
      );
    return trip;
  }

  private async write<T>(
    user_id: string,
    id: string,
    driver_only: boolean,
    action: (tx: TransactionClient, trip: Trip) => Promise<T>,
  ) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_account(tx, user_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${id}))`;
      const trip = await this.owned(user_id, id, tx);
      if (driver_only && trip.driver?.user_id !== user_id)
        throw new AppError(
          403,
          'ASSIGNED_DRIVER_REQUIRED',
          'Only the assigned driver can perform this action.',
        );
      if (trip.driver) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${trip.driver.user_id}))`;
        if (driver_only) await require_driver_participation(tx, user_id);
      }
      // Re-read after waiting for the driver lock: verification/vehicle writes
      // coordinate there and must not be overwritten by an earlier snapshot.
      return action(tx, await this.owned(user_id, id, tx));
    }, options);
  }

  private read_owned(user_id: string, ride_id: string) {
    // Related proofs/payment rows must belong to the same database snapshot
    // as the ride state, even when a start/completion commits during polling.
    return this.database.client.$transaction(
      (tx) => this.owned(user_id, ride_id, tx),
      {
        ...options,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }

  async approved_upi(
    user_id: string,
    tx: TransactionClient = this.database.client,
  ) {
    return approved_driver_upi(tx, user_id);
  }

  async dispatch(ride_id: string) {
    const settings = await this.settings();
    await this.database.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      const acquired = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(720044, hashtext(${ride_id})) AS locked`;
      if (!acquired[0]?.locked) return;
      const ride = await tx.ride.findUnique({
        where: { id: ride_id },
        include: { quotes: { where: { selected_at: { not: null } } } },
      });
      if (
        !ride ||
        ride.status !== 'SEARCHING' ||
        (ride.next_dispatch_at && ride.next_dispatch_at > new Date())
      )
        return;
      const age_s =
        (Date.now() - (ride.requested_at ?? ride.created_at).getTime()) / 1000;
      if (age_s >= settings.search_timeout_s) {
        await tx.ride.update({
          where: { id: ride_id },
          data: { status: 'NO_DRIVER_FOUND' },
        });
        await tx.rideOffer.updateMany({
          where: { ride_id, status: 'SENT' },
          data: { status: 'EXPIRED' },
        });
        await tx.rideEvent.create({
          data: { ride_id, event_type: 'NO_DRIVER_FOUND' },
        });
        await notify(
          tx,
          ride.rider_id,
          ride_id,
          'No driver available',
          'No driver accepted this request. You have not been charged.',
        );
        return;
      }
      const radius = search_radius_km(
        age_s,
        settings.matching_initial_radius_km,
        settings.matching_max_radius_km,
        settings.matching_expansion_s,
      );
      await tx.ride.update({
        where: { id: ride_id },
        data: {
          search_radius_km: radius,
          next_dispatch_at: new Date(Date.now() + 5000),
        },
      });
      const candidates = await tx.driverProfile.findMany({
        where: {
          user_id: { not: ride.rider_id },
          active_vehicle: {
            vehicle_category_id: ride.quotes[0]?.vehicle_category_id,
            status: 'ACTIVE',
          },
          current_latitude: {
            gte: Math.max(-90, ride.pickup_latitude.toNumber() - radius / 111),
            lte: Math.min(90, ride.pickup_latitude.toNumber() + radius / 111),
          },
          current_longitude: {
            gte: Math.max(
              -180,
              ride.pickup_longitude.toNumber() -
                radius /
                  (111 *
                    Math.max(
                      0.01,
                      Math.cos(
                        (ride.pickup_latitude.toNumber() * Math.PI) / 180,
                      ),
                    )),
            ),
            lte: Math.min(
              180,
              ride.pickup_longitude.toNumber() +
                radius /
                  (111 *
                    Math.max(
                      0.01,
                      Math.cos(
                        (ride.pickup_latitude.toNumber() * Math.PI) / 180,
                      ),
                    )),
            ),
          },
          last_location_accuracy_m: { lte: settings.arrival_radius_m },
          verification_status: 'VERIFIED',
          availability: { in: ['AVAILABLE', 'ON_TRIP'] },
          last_location_at: {
            gte: new Date(Date.now() - settings.location_max_age_s * 1000),
          },
          user: {
            status: 'ACTIVE',
            deleted_at: null,
            OR: [
              { partner_application: null },
              { partner_application: { status: { not: 'EXITED' } } },
            ],
          },
        },
        include: { active_vehicle: { include: MATCHING_VEHICLE_INCLUDE } },
        orderBy: [{ availability: 'asc' }, { last_location_at: 'desc' }],
        take: 100,
      });
      const ranked = candidates
        .filter(
          (d) =>
            d.current_latitude &&
            d.current_longitude &&
            is_vehicle_eligible(d.active_vehicle, ride.quotes[0], d.id),
        )
        .map((d) => ({
          driver: d,
          distance: trip_distance_m(
            d.current_latitude!.toNumber(),
            d.current_longitude!.toNumber(),
            ride.pickup_latitude.toNumber(),
            ride.pickup_longitude.toNumber(),
          ),
        }))
        .filter((d) => d.distance <= radius * 1000)
        .sort(
          (a, b) =>
            Number(a.driver.availability !== 'AVAILABLE') -
              Number(b.driver.availability !== 'AVAILABLE') ||
            a.distance - b.distance,
        );
      const policy = object(
        object(ride.quotes[0]?.category_snapshot).payment_policy,
      );
      const needs_upi =
        policy.cash_enabled === false || ride.collection_preference === 'UPI';
      const upis = needs_upi
        ? await approved_driver_upis(
            tx,
            ranked.map(({ driver }) => driver.user_id),
          )
        : null;
      let offered = 0;
      for (const { driver } of ranked) {
        if (needs_upi && !upis?.has(driver.user_id)) continue;
        const old = await tx.rideOffer.findUnique({
          where: { ride_id_driver_id: { ride_id, driver_id: driver.id } },
        });
        if (old && ['REJECTED', 'ACCEPTED'].includes(old.status)) continue;
        if (old?.status === 'SENT' && old.expires_at > new Date()) {
          if (++offered >= 8) break;
          continue;
        }
        const expires_at = new Date(
          Date.now() + settings.offer_lifetime_s * 1000,
        );
        if (old)
          await tx.rideOffer.update({
            where: { id: old.id },
            data: {
              status: 'SENT',
              sent_at: new Date(),
              responded_at: null,
              expires_at,
            },
          });
        else
          await tx.rideOffer.create({
            data: { ride_id, driver_id: driver.id, expires_at },
          });
        if (++offered >= 8) break;
      }
    }, options);
  }

  async dashboard(user_id: string) {
    const settings = await this.settings();
    const profile = await this.database.client.driverProfile.findUnique({
      where: { user_id },
      include: {
        user: {
          select: {
            status: true,
            partner_application: { select: { status: true } },
          },
        },
        active_vehicle: { include: MATCHING_VEHICLE_INCLUDE },
      },
    });
    if (!profile)
      throw new AppError(
        403,
        'DRIVER_PROFILE_REQUIRED',
        'Complete driver activation and vehicle verification first.',
      );
    const searches = await this.database.client.ride.findMany({
      where: {
        status: 'SEARCHING',
        OR: [
          { next_dispatch_at: null },
          { next_dispatch_at: { lte: new Date() } },
        ],
      },
      select: { id: true },
      orderBy: { requested_at: 'asc' },
      take: 3,
    });
    for (const ride of searches) await this.dispatch(ride.id);
    const current = await this.database.client.ride.findFirst({
      where: { driver_id: profile.id, status: { in: [...ACTIVE_TRIP] } },
      select: { id: true, status: true },
      orderBy: { created_at: 'asc' },
    });
    const exited = profile.user.partner_application?.status === 'EXITED';
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
        ? await this.database.client.rideOffer.findMany({
            where: {
              driver_id: profile.id,
              status: 'SENT',
              expires_at: { gt: new Date() },
              ride: { status: 'SEARCHING' },
            },
            select: {
              id: true,
              expires_at: true,
              ride: {
                select: {
                  id: true,
                  pickup_address: true,
                  pickup_latitude: true,
                  pickup_longitude: true,
                  dropoff_address: true,
                  dropoff_latitude: true,
                  dropoff_longitude: true,
                  estimated_fare: true,
                  estimated_distance_m: true,
                  estimated_duration_s: true,
                },
              },
            },
            orderBy: { sent_at: 'desc' },
            take: 20,
          })
        : [];
    return {
      availability: profile.availability,
      eligible,
      exited,
      location_fresh: fresh,
      settings,
      current_trip: current,
      vehicle: profile.active_vehicle
        ? {
            id: profile.active_vehicle.id,
            make: profile.active_vehicle.make,
            model: profile.active_vehicle.model,
            plate_number: profile.active_vehicle.plate_number,
          }
        : null,
      offers: offers.map((offer) => ({
        ...offer,
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
      is_driver &&
      (active(trip.status) ||
        (await this.database.client.ride.count({
          where: {
            driver_id: trip.driver_id!,
            status: { in: [...ACTIVE_TRIP] },
          },
        })) > 0);
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
      (trip.driver ? await this.approved_upi(trip.driver.user_id) : null);
    const contact = is_driver ? trip.rider : trip.driver?.user;
    const policy = payment_policy(trip);
    const free_wait_minutes =
      typeof policy.free_pickup_wait_minutes === 'number'
        ? policy.free_pickup_wait_minutes
        : 5;
    const no_show_contact_attempted =
      is_driver && trip.status === 'DRIVER_WAITING' && trip.arrived_at
        ? !!(await this.database.client.rideEvent.findFirst({
            where: {
              ride_id,
              actor_id: user_id,
              event_type: 'CALL_ATTEMPT',
              created_at: { gte: trip.arrived_at },
            },
            select: { id: true },
          }))
        : false;
    return {
      ride_id,
      collection_preference: trip.collection_preference,
      direct_collection_allowed:
        trip.status === 'COMPLETED' &&
        (!trip.payment ||
          (['PENDING', 'FAILED'].includes(trip.payment.status) &&
            !trip.payment.provider &&
            !trip.payment.provider_payment_id)),
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
          ? Prisma.Decimal.min(
              (trip.estimated_fare ?? new Prisma.Decimal(0))
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
          : new Prisma.Decimal(0),
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
            method: trip.payment.collection_method,
            recipient_upi: trip.payment.recipient_upi,
            unpaid_reason: trip.payment.unpaid_reason,
          }
        : null,
      payment_options: {
        cash: policy.cash_enabled !== false,
        upi: policy.direct_upi_enabled === true && !!upi,
        upi_handle: trip.status === 'COMPLETED' ? upi : null,
      },
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

  async arrive(user_id: string, ride_id: string) {
    const settings = await this.settings();
    await this.write(user_id, ride_id, true, async (tx, trip) => {
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
        !driver.current_latitude ||
        !driver.current_longitude
      )
        throw new AppError(
          409,
          'FRESH_LOCATION_REQUIRED',
          'Wait for an accurate, fresh GPS fix before marking arrived.',
        );
      const distance = trip_distance_m(
        driver.current_latitude.toNumber(),
        driver.current_longitude.toNumber(),
        trip.pickup_latitude.toNumber(),
        trip.pickup_longitude.toNumber(),
      );
      if (distance > settings.arrival_radius_m)
        throw new AppError(
          409,
          'OUTSIDE_PICKUP_RADIUS',
          `Reach within ${settings.arrival_radius_m} metres of pickup before marking arrived.`,
        );
      await tx.ride.update({
        where: { id: ride_id },
        data: { status: 'DRIVER_WAITING', arrived_at: new Date() },
      });
      await tx.rideStartVerification.upsert({
        where: { ride_id },
        create: {
          ride_id,
          driver_id: driver.id,
          assignment_at: trip.matched_at!,
          ...new_trip_code(ride_id),
        },
        update: {
          driver_id: driver.id,
          assignment_at: trip.matched_at!,
          ...new_trip_code(ride_id),
          rider_confirmed_at: null,
          driver_verified_at: null,
          used_at: null,
        },
      });
      await tx.rideEvent.create({
        data: {
          ride_id,
          actor_id: user_id,
          event_type: 'DRIVER_WAITING',
          metadata: {
            distance_m: Math.round(distance),
            gps_verified: true,
            arrival_radius_m: settings.arrival_radius_m,
            accuracy_m: driver.last_location_accuracy_m,
          },
        },
      });
      await notify(
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
    await this.write(user_id, ride_id, false, async (tx, trip) => {
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
      await tx.rideStartVerification.upsert({
        where: { ride_id },
        create: {
          ride_id,
          driver_id: trip.driver_id!,
          assignment_at: trip.matched_at!,
          ...new_trip_code(ride_id),
        },
        update: {
          driver_id: trip.driver_id!,
          assignment_at: trip.matched_at!,
          ...new_trip_code(ride_id),
          rider_confirmed_at: null,
          driver_verified_at: null,
          used_at: null,
        },
      });
      await tx.rideEvent.create({
        data: { ride_id, actor_id: user_id, event_type: 'TRIP_CODE_REFRESHED' },
      });
    });
    return this.context(user_id, ride_id);
  }

  async start_proof(user_id: string, ride_id: string, code?: string) {
    const result = await this.write(
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
          await tx.rideStartVerification.update({
            where: { ride_id },
            data: { attempts: { increment: 1 } },
          });
          return { error: 'TRIP_CODE_INVALID' as const };
        }
        const saved = await tx.rideStartVerification.update({
          where: { ride_id },
          data:
            code === undefined
              ? { rider_confirmed_at: v.rider_confirmed_at ?? new Date() }
              : { driver_verified_at: v.driver_verified_at ?? new Date() },
        });
        if (saved.rider_confirmed_at && saved.driver_verified_at) {
          await tx.ride.update({
            where: { id: ride_id },
            data: { status: 'IN_PROGRESS', started_at: new Date() },
          });
          await tx.driverProfile.update({
            where: { id: trip.driver_id! },
            data: { availability: 'ON_TRIP' },
          });
          await tx.rideStartVerification.update({
            where: { ride_id },
            data: { used_at: new Date(), code_ciphertext: '', code_hash: '' },
          });
          await tx.rideEvent.create({
            data: {
              ride_id,
              actor_id: user_id,
              event_type: 'TRIP_STARTED',
              metadata: { rider_confirmed: true, driver_verified: true },
            },
          });
          await notify(
            tx,
            trip.rider_id,
            ride_id,
            'Ride started',
            'Your ride has started after both start checks were completed.',
          );
        }
        return {
          started: !!(saved.rider_confirmed_at && saved.driver_verified_at),
        };
      },
    );
    if ('error' in result)
      throw new AppError(422, result.error!, 'The trip code is incorrect.');
    return this.context(user_id, ride_id);
  }

  async complete(user_id: string, ride_id: string) {
    await this.write(user_id, ride_id, true, async (tx, trip) => {
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
      const points = await tx.rideLocation.findMany({
        where: { ride_id, recorded_at: { gte: trip.started_at } },
        select: { latitude: true, longitude: true, recorded_at: true },
        orderBy: { recorded_at: 'asc' },
        take: 10000,
      });
      let distance = 0;
      let valid_segments = 0;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!,
          b = points[i]!;
        const segment = trip_distance_m(
          a.latitude.toNumber(),
          a.longitude.toNumber(),
          b.latitude.toNumber(),
          b.longitude.toNumber(),
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
          valid_segments++;
        }
      }
      await tx.ride.update({
        where: { id: ride_id },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
          final_fare: trip.estimated_fare,
          actual_duration_s: Math.max(
            1,
            Math.round((Date.now() - trip.started_at.getTime()) / 1000),
          ),
          actual_distance_m: valid_segments > 0 ? Math.round(distance) : null,
        },
      });
      await tx.payment.upsert({
        where: { ride_id },
        create: {
          ride_id,
          amount: trip.estimated_fare,
          currency: trip.currency,
          status: 'PENDING',
        },
        update: {},
      });
      await tx.driverProfile.update({
        where: { id: trip.driver_id! },
        data: {
          completed_rides: { increment: 1 },
          availability: availability_after_trip(trip.driver!),
        },
      });
      await tx.rideEvent.create({
        data: {
          ride_id,
          actor_id: user_id,
          event_type: 'TRIP_COMPLETED',
          metadata: { fare_source: 'ACCEPTED_QUOTE' },
        },
      });
      await notify(
        tx,
        trip.rider_id,
        ride_id,
        'Ride completed',
        'Pay the displayed fare directly to the driver. Payment remains pending until the driver confirms receipt.',
      );
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Ride',
        entity_id: ride_id,
        action: 'COMPLETE_OPERATIONAL_TRIP',
        after_data: { final_fare: trip.estimated_fare.toString() },
      });
    });
    return this.context(user_id, ride_id);
  }

  async payment(
    user_id: string,
    ride_id: string,
    method: 'CASH' | 'UPI',
    receipt?: { received: boolean; reason?: string },
  ) {
    await this.write(user_id, ride_id, !!receipt, async (tx, trip) => {
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
      require_supported_ride_payment(trip.quotes[0]?.category_snapshot, method);
      const upi =
        method === 'UPI'
          ? (trip.payment?.recipient_upi ??
            (await this.approved_upi(trip.driver.user_id, tx)))
          : null;
      if (method === 'UPI' && !upi)
        throw new AppError(
          409,
          'DRIVER_UPI_NOT_CONFIGURED',
          'The driver has no uniquely approved UPI account. Use enabled cash payment or contact support.',
        );
      const paid = receipt?.received === true;
      await tx.payment.upsert({
        where: { ride_id },
        create: {
          ride_id,
          amount: trip.final_fare,
          currency: trip.currency,
          collection_method: method,
          recipient_upi: upi,
          status: paid ? 'CAPTURED' : 'PENDING',
          confirmed_by_id: paid ? user_id : null,
          paid_at: paid ? new Date() : null,
          unpaid_reason: receipt?.received === false ? receipt.reason : null,
        },
        update: {
          collection_method: method,
          recipient_upi: upi,
          status: paid ? 'CAPTURED' : 'PENDING',
          confirmed_by_id: paid ? user_id : null,
          paid_at: paid ? new Date() : null,
          unpaid_reason: receipt
            ? receipt.received
              ? null
              : receipt.reason
            : undefined,
        },
      });
      if (paid)
        await tx.rideSettlementReview.updateMany({
          where: {
            ride_id,
            kind: 'UNPAID',
            status: { in: ['REQUESTED', 'DISPUTED', 'APPROVED'] },
          },
          data: {
            status: 'SETTLED',
            resolved_by_id: user_id,
            resolution_note:
              'The assigned driver confirmed receipt of the full fare.',
            version: { increment: 1 },
          },
        });
      if (receipt?.received === false)
        await tx.rideSettlementReview.upsert({
          where: { ride_id },
          create: {
            ride_id,
            reported_by_id: user_id,
            driver_id: trip.driver_id,
            kind: 'UNPAID',
            reason: receipt.reason!,
            fee_amount: trip.final_fare,
          },
          update: {},
        });
      await tx.rideEvent.create({
        data: {
          ride_id,
          actor_id: user_id,
          event_type: receipt
            ? paid
              ? 'COLLECTION_CONFIRMED'
              : 'FARE_UNPAID_REPORTED'
            : 'PAYMENT_METHOD_SELECTED',
          metadata: { method, received: paid },
        },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Payment',
        entity_id: ride_id,
        action: receipt ? 'DRIVER_COLLECTION_REPORT' : 'SELECT_DIRECT_PAYMENT',
        after_data: { method, received: paid },
      });
      if (paid)
        await notify(
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
    const trip = await this.owned(user_id, ride_id);
    if (trip.driver?.user_id !== user_id || !active(trip.status))
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
        to_latitude: (destination
          ? trip.dropoff_latitude
          : trip.pickup_latitude
        ).toNumber(),
        to_longitude: (destination
          ? trip.dropoff_longitude
          : trip.pickup_longitude
        ).toNumber(),
      },
      true,
    );
    return { ...route, target: destination ? 'DROPOFF' : 'PICKUP' };
  }

  async rider_route(user_id: string, ride_id: string) {
    const trip = await this.read_owned(user_id, ride_id);
    if (trip.rider_id !== user_id || !active(trip.status))
      throw new AppError(
        403,
        'RIDER_ROUTE_UNAVAILABLE',
        'Route progress is available only to the rider during an assigned trip.',
      );
    const settings = await this.settings();
    const driver = trip.driver;
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
      from_latitude: driver.current_latitude.toNumber(),
      from_longitude: driver.current_longitude.toNumber(),
      to_latitude: (target === 'DROPOFF'
        ? trip.dropoff_latitude
        : trip.pickup_latitude
      ).toNumber(),
      to_longitude: (target === 'DROPOFF'
        ? trip.dropoff_longitude
        : trip.pickup_longitude
      ).toNumber(),
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
    await this.owned(user_id, ride_id);
    const rows = await this.database.client.rideMessage.findMany({
      where: { ride_id },
      select: {
        id: true,
        sender_id: true,
        body: true,
        created_at: true,
        client_key: true,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return rows.reverse();
  }
  async send_message(
    user_id: string,
    ride_id: string,
    body: string,
    client_key: string,
  ) {
    return this.write(user_id, ride_id, false, async (tx, trip) => {
      if (!active(trip.status))
        throw new AppError(
          409,
          'TRIP_CHAT_CLOSED',
          'Trip chat is available only while the ride is active.',
        );
      const existing = await tx.rideMessage.findUnique({
        where: {
          ride_id_sender_id_client_key: {
            ride_id,
            sender_id: user_id,
            client_key,
          },
        },
      });
      if (existing) {
        if (existing.body !== body)
          throw new AppError(
            409,
            'MESSAGE_RETRY_CONFLICT',
            'This message retry changed.',
          );
        return { id: existing.id };
      }
      const recent = await tx.rideMessage.count({
        where: {
          ride_id,
          sender_id: user_id,
          created_at: { gte: new Date(Date.now() - 10000) },
        },
      });
      if (recent >= 5)
        throw new AppError(
          429,
          'TRIP_CHAT_RATE_LIMIT',
          'Wait a moment before sending another message.',
        );
      const message = await tx.rideMessage.create({
        data: { ride_id, sender_id: user_id, body, client_key },
      });
      return { id: message.id };
    });
  }
  async contact_attempt(user_id: string, ride_id: string) {
    return this.write(user_id, ride_id, false, async (tx, trip) => {
      if (!active(trip.status))
        throw new AppError(
          409,
          'TRIP_CONTACT_CLOSED',
          'Calling is available only while the trip is active.',
        );
      const other = trip.rider_id === user_id ? trip.driver?.user : trip.rider;
      if (!other?.phone_e164)
        throw new AppError(
          409,
          'CONTACT_PHONE_UNAVAILABLE',
          'The other person has no available phone number. Use trip chat or Support.',
        );
      await tx.rideEvent.create({
        data: {
          ride_id,
          actor_id: user_id,
          event_type: 'CALL_ATTEMPT',
          metadata: { connection_verified: false },
        },
      });
      return { phone: other.phone_e164 };
    });
  }

  async report_issue(
    user_id: string,
    ride_id: string,
    kind: 'CANCELLATION' | 'NO_SHOW',
    reason: string,
    reason_code?: string,
  ) {
    const settings = await this.settings();
    await this.write(user_id, ride_id, false, async (tx, trip) => {
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
      let amount = new Prisma.Decimal(0);
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
        const call = await tx.rideEvent.findFirst({
          where: {
            ride_id,
            actor_id: user_id,
            event_type: 'CALL_ATTEMPT',
            created_at: { gte: trip.arrived_at },
          },
        });
        const arrival = await tx.rideEvent.findFirst({
          where: { ride_id, actor_id: user_id, event_type: 'DRIVER_WAITING' },
          orderBy: { created_at: 'desc' },
        });
        if (!call || object(arrival?.metadata).gps_verified !== true)
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
            d.current_latitude.toNumber(),
            d.current_longitude.toNumber(),
            trip.pickup_latitude.toNumber(),
            trip.pickup_longitude.toNumber(),
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
        amount = Prisma.Decimal.min(
          (trip.estimated_fare ?? new Prisma.Decimal(0)).mul(percent).div(100),
          cap,
        ).toDecimalPlaces(2);
      }
      if (trip.driver_id)
        await tx.rideSettlementReview.create({
          data: {
            ride_id,
            reported_by_id: user_id,
            driver_id: trip.driver_id,
            kind,
            reason,
            fee_amount: amount,
            status: !driver && amount.isZero() ? 'WAIVED' : 'REQUESTED',
            resolution_note: amount.isZero()
              ? 'No passenger fee is due. Any driver conduct concern remains available in the trip audit.'
              : null,
          },
        });
      await tx.ride.update({
        where: { id: ride_id },
        data: {
          status: 'CANCELLED',
          cancelled_at: new Date(),
          cancel_reason: reason,
        },
      });
      await tx.rideOffer.updateMany({
        where: { ride_id, status: { in: ['SENT', 'ACCEPTED'] } },
        data: { status: 'CANCELLED', responded_at: new Date() },
      });
      if (trip.driver)
        await tx.driverProfile.update({
          where: { id: trip.driver.id },
          data: { availability: availability_after_trip(trip.driver) },
        });
      await tx.rideStartVerification.deleteMany({ where: { ride_id } });
      await tx.rideEvent.create({
        data: {
          ride_id,
          actor_id: user_id,
          event_type:
            kind === 'NO_SHOW'
              ? 'PASSENGER_NO_SHOW_REPORTED'
              : 'CANCELLATION_REPORTED',
          metadata: {
            review_required: true,
            reason_code: reason_code ?? 'OTHER',
          },
        },
      });
      await notify(
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
    await this.write(user_id, ride_id, false, async (tx, trip) => {
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
      await tx.rideSettlementReview.update({
        where: { ride_id },
        data: {
          status: 'DISPUTED',
          dispute_reason: reason,
          version: { increment: 1 },
        },
      });
      await tx.rideEvent.create({
        data: { ride_id, actor_id: user_id, event_type: 'CHARGE_DISPUTED' },
      });
    });
    return this.context(user_id, ride_id);
  }
  async reviews(status?: string, page = 1) {
    const page_size = 20;
    const where = status
      ? {
          status:
            status === 'PENDING' ? { in: pending_review_statuses } : status,
        }
      : {};
    const result = await this.database.client.$transaction(
      async (tx) => {
        const total = await tx.rideSettlementReview.count({ where });
        const current_page = Math.min(
          page,
          Math.max(1, Math.ceil(total / page_size)),
        );
        const items = await tx.rideSettlementReview.findMany({
          where,
          include: {
            ride: {
              select: {
                rider_id: true,
                created_at: true,
                rider: { select: ride_person },
                driver: { select: { user: { select: ride_person } } },
                vehicle: { select: admin_vehicle_select },
                driver_id: true,
                status: true,
                pickup_address: true,
                dropoff_address: true,
                matched_at: true,
                arrived_at: true,
                cancelled_at: true,
                events: {
                  where: {
                    event_type: {
                      in: [
                        'DRIVER_WAITING',
                        'CALL_ATTEMPT',
                        'CANCELLATION_REPORTED',
                        'PASSENGER_NO_SHOW_REPORTED',
                        'FARE_UNPAID_REPORTED',
                        'CHARGE_DISPUTED',
                      ],
                    },
                  },
                  select: {
                    id: true,
                    event_type: true,
                    created_at: true,
                    metadata: true,
                  },
                  orderBy: { created_at: 'asc' },
                },
                final_fare: true,
                estimated_fare: true,
                payment: { select: { status: true, collection_method: true } },
              },
            },
          },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          skip: (current_page - 1) * page_size,
          take: page_size,
        });
        return { total, items, page: current_page };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const { total, items } = result;
    const reporters = items.length
      ? await this.database.client.user.findMany({
          where: {
            id: { in: [...new Set(items.map((row) => row.reported_by_id))] },
          },
          select: ride_person,
        })
      : [];
    const by_id = new Map(reporters.map((person) => [person.id, person]));
    return {
      items: items.map((row) => ({
        ...row,
        reported_by: by_id.get(row.reported_by_id) ?? null,
      })),
      total,
      page: result.page,
      page_size,
    };
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
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const initial = await tx.rideSettlementReview.findUnique({
        where: { id },
        select: { ride_id: true },
      });
      if (!initial)
        throw new AppError(
          404,
          'REVIEW_NOT_FOUND',
          'This review no longer exists.',
        );
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${initial.ride_id}))`;
      const before = await tx.rideSettlementReview.findUniqueOrThrow({
        where: { id },
      });
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
        const payment = await tx.payment.findUnique({
          where: { ride_id: before.ride_id },
        });
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
      const saved = await tx.rideSettlementReview.update({
        where: { id },
        data: {
          status: input.status,
          resolution_note: input.note,
          resolved_by_id: actor_id,
          version: { increment: 1 },
        },
      });
      if (before.kind === 'UNPAID' && input.status === 'WAIVED')
        await tx.payment.update({
          where: { ride_id: before.ride_id },
          data: { status: 'CANCELLED', unpaid_reason: input.note },
        });
      if (before.kind === 'UNPAID' && input.status === 'SETTLED')
        await tx.payment.update({
          where: { ride_id: before.ride_id },
          data: {
            status: 'CAPTURED',
            paid_at: new Date(),
            confirmed_by_id: actor_id,
            unpaid_reason: null,
          },
        });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'RideSettlementReview',
        entity_id: id,
        action: 'REVIEW_TRIP_SETTLEMENT',
        before_data: before,
        after_data: saved,
      });
      return saved;
    }, options);
  }
}
