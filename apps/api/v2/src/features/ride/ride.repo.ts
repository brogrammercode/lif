import { Injectable } from '@nestjs/common';
import { DEFAULT_CURRENCY } from '../../core/constants.js';
import { AppError } from '../../core/error.js';
import { requireActiveAccount } from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import {
  CONFIGURATION_KEY,
  FARE_POLICY_LOCK,
} from '../app_configuration/app_configuration.type.js';
import { require_supported_ride_payment } from '../app_configuration/payment_policy.js';
import { CATEGORY_MESSAGES } from '../vehicle_category/vehicle_category.constant.js';
import { riderActiveStatuses } from '../travel_context/sql/travel-context.sql.js';
import { ROUTE_PROVIDER } from './ride.constant.js';
import type { CreateRideInput, QuoteInput, ReviewInput } from './ride.type.js';
import {
  eligibleCategories,
  insertQuoteRows,
  participantJoins,
  quoteRows,
  rideColumns,
  rideParticipants,
} from './sql/rider-rides.sql.js';

type VehicleType = 'BIKE' | 'SCOOTER' | 'AUTO' | 'SEDAN' | 'SUV';
export type FareCalculation = {
  distance_m: number;
  duration_s: number;
  vehicle_type: VehicleType;
  vehicle_category_id: string;
  category_updated_at?: string;
  fare_policy_version?: number;
  category_snapshot: Record<string, unknown>;
  pickup_eta_s: number;
  base_fare: number;
  distance_fare: number;
  time_fare: number;
  total_fare: number;
};
type RideRow = { id: string; status: string; rider_note: string | null };
type StoredQuote = {
  id: string;
  vehicle_category_id: string | null;
  category_snapshot: unknown;
  total_fare: string;
  expires_at: Date;
};
type Category = {
  id: string;
  vehicle_type: VehicleType;
  updated_at: Date;
  capacity: number;
};
const rideLock = (tx: SqlClient, scope: number, key: string) =>
  tx.query('SELECT pg_advisory_xact_lock($1::integer,hashtext($2))', [
    scope,
    key,
  ]);

@Injectable()
export class RideRepository {
  constructor(private readonly db: PostgresService) {}

  private async tripParts(tx: SqlClient, id: string) {
    const quotes = await tx.query<StoredQuote>(quoteRows, [id]);
    const route = await tx.query('SELECT * FROM ride_routes WHERE ride_id=$1', [
      id,
    ]);
    return { quotes: quotes.rows, route: route.rows[0] ?? null };
  }

  readonly create_quote = (
    user: string,
    input: QuoteInput,
    calculations: FareCalculation[],
    expires: Date,
    geometry: unknown,
  ) =>
    this.db.transaction(async (tx) => {
      await requireActiveAccount(tx, user);
      await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
      if (calculations.some((item) => item.fare_policy_version !== undefined)) {
        await tx.query('SELECT pg_advisory_xact_lock_shared($1::integer)', [
          FARE_POLICY_LOCK,
        ]);
        const policy = await tx.query<{ version: number }>(
          'SELECT version FROM ride_fare_policies WHERE key=$1',
          [CONFIGURATION_KEY],
        );
        const version = policy.rows[0]?.version ?? 0;
        if (calculations.some((item) => item.fare_policy_version !== version))
          throw new AppError(
            409,
            'FARE_POLICY_CHANGED',
            'The fare policy changed. Request fresh ride options.',
          );
      }
      const available = await tx.query<Category>(
        `SELECT c.id,c.vehicle_type,c.updated_at ${eligibleCategories} AND c.id=ANY($1::text[])`,
        [calculations.map((item) => item.vehicle_category_id)],
      );
      const categories = new Map(available.rows.map((item) => [item.id, item]));
      if (
        !calculations.length ||
        categories.size !== calculations.length ||
        calculations.some((calculation) => {
          const item = categories.get(calculation.vehicle_category_id);
          return (
            !item ||
            item.vehicle_type !== calculation.vehicle_type ||
            (calculation.category_updated_at &&
              item.updated_at.toISOString() !== calculation.category_updated_at)
          );
        })
      )
        throw new AppError(
          409,
          'CATEGORY_UNAVAILABLE',
          CATEGORY_MESSAGES.UNAVAILABLE,
        );
      const first = calculations[0]!;
      const id = nextEntityId();
      await tx.query(
        `INSERT INTO rides (id,rider_id,status,pickup_address,pickup_latitude,pickup_longitude,
          dropoff_address,dropoff_latitude,dropoff_longitude,rider_note,estimated_distance_m,estimated_duration_s,currency,updated_at)
        VALUES ($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp())`,
        [
          id,
          user,
          input.pickup.address,
          input.pickup.latitude,
          input.pickup.longitude,
          input.dropoff.address,
          input.dropoff.latitude,
          input.dropoff.longitude,
          input.rider_note,
          first.distance_m,
          first.duration_s,
          DEFAULT_CURRENCY,
        ],
      );
      await tx.query(
        `INSERT INTO ride_routes (id,ride_id,provider,distance_m,duration_s,route_data,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,clock_timestamp())`,
        [
          nextEntityId(),
          id,
          ROUTE_PROVIDER,
          first.distance_m,
          first.duration_s,
          JSON.stringify({
            pickup: input.pickup,
            dropoff: input.dropoff,
            geometry,
          }),
        ],
      );
      await tx.query(insertQuoteRows, [
        id,
        DEFAULT_CURRENCY,
        expires,
        JSON.stringify(
          calculations.map((item) => ({ ...item, id: nextEntityId() })),
        ),
      ]);
      const ride = await tx.query<RideRow>(
        `SELECT ${rideColumns} FROM rides r WHERE r.id=$1`,
        [id],
      );
      const parts = await this.tripParts(tx, id);
      await insertUserLog(tx, {
        actor_id: user,
        entity_type: 'Ride',
        entity_id: id,
        action: 'CREATE_RIDE_QUOTE',
        after_data: { quote_count: calculations.length },
      });
      return { ...ride.rows[0]!, ...parts };
    });

  readonly request_ride = (user: string, input: CreateRideInput) =>
    this.db.transaction(async (tx) => {
      await requireActiveAccount(tx, user);
      await rideLock(tx, 720054, user);
      await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
      await rideLock(tx, 720044, input.draft_ride_id);
      const draft = await tx.query<RideRow>(
        'SELECT id,status,rider_note FROM rides WHERE id=$1 AND rider_id=$2',
        [input.draft_ride_id, user],
      );
      const ride = draft.rows[0];
      if (!ride) return { kind: 'ride_not_found' as const };
      if (ride.status !== 'DRAFT') return { kind: 'invalid_state' as const };
      const other = await tx.query(
        `SELECT 1 FROM rides r LEFT JOIN driver_profiles d ON d.id=r.driver_id
        WHERE (r.rider_id=$1 OR d.user_id=$1) AND r.id<>$2 AND r.status=ANY($3::"RideStatus"[]) LIMIT 1`,
        [user, ride.id, riderActiveStatuses],
      );
      if (other.rowCount)
        throw new AppError(
          409,
          'ACTIVE_RIDE_EXISTS',
          'Finish or cancel your current ride before requesting another.',
        );
      const driver = await tx.query<{ availability: string }>(
        'SELECT availability FROM driver_profiles WHERE user_id=$1',
        [user],
      );
      if (
        driver.rows[0] &&
        !['OFFLINE', 'SUSPENDED'].includes(driver.rows[0].availability)
      )
        throw new AppError(
          409,
          'DRIVER_MUST_GO_OFFLINE',
          'Switch to rider mode and go offline before booking a ride.',
        );
      const selected = await tx.query<StoredQuote>(
        `SELECT id,vehicle_category_id,category_snapshot,total_fare,expires_at
        FROM fare_quotes WHERE ride_id=$1 AND id=$2`,
        [ride.id, input.quote_id],
      );
      const quote = selected.rows[0];
      if (!quote) return { kind: 'quote_not_found' as const };
      const passengers = input.passenger_count ?? 1;
      if (
        passengers >
        ((quote.category_snapshot as { capacity?: number } | null)?.capacity ??
          1)
      )
        throw new AppError(
          422,
          'PASSENGER_CAPACITY_EXCEEDED',
          'Passenger count exceeds this category capacity.',
        );
      if (quote.expires_at.getTime() <= Date.now())
        return { kind: 'quote_expired' as const };
      const method = input.payment_method_id
        ? (
            await tx.query<{ type: 'CASH' | 'UPI' | 'CARD' | 'WALLET' }>(
              `SELECT type FROM payment_methods WHERE id=$1 AND user_id=$2
          AND (type<>'UPI' OR provider_method_id IS NOT NULL)`,
              [input.payment_method_id, user],
            )
          ).rows[0]
        : undefined;
      if (input.payment_method_id && !method)
        return { kind: 'payment_method_not_found' as const };
      const preference = method?.type ?? input.payment_preference ?? 'CASH';
      require_supported_ride_payment(quote.category_snapshot, preference);
      if (!quote.vehicle_category_id)
        return { kind: 'quote_unavailable' as const };
      const category = await tx.query<{ capacity: number }>(
        `SELECT c.capacity ${eligibleCategories} AND c.id=$1`,
        [quote.vehicle_category_id],
      );
      if (!category.rows[0]) return { kind: 'quote_unavailable' as const };
      if (passengers > category.rows[0].capacity)
        throw new AppError(
          422,
          'PASSENGER_CAPACITY_EXCEEDED',
          'This category capacity changed. Get fresh ride options.',
        );
      const claimed = await tx.query(
        `UPDATE rides SET status='SEARCHING',passenger_count=$3,rider_note=$4,
          payment_method_id=COALESCE($5,payment_method_id),collection_preference=$6,
          requested_at=clock_timestamp(),estimated_fare=$7,updated_at=clock_timestamp()
        WHERE id=$1 AND rider_id=$2 AND status='DRAFT'`,
        [
          ride.id,
          user,
          passengers,
          input.rider_note ?? ride.rider_note,
          input.payment_method_id,
          preference,
          quote.total_fare,
        ],
      );
      if (claimed.rowCount !== 1) return { kind: 'invalid_state' as const };
      await tx.query(
        'UPDATE fare_quotes SET selected_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1',
        [quote.id],
      );
      const updated = await tx.query<RideRow>(
        `SELECT ${rideColumns} FROM rides r WHERE r.id=$1`,
        [ride.id],
      );
      const parts = await this.tripParts(tx, ride.id);
      await tx.query(
        "INSERT INTO ride_events (id,ride_id,actor_id,event_type,updated_at) VALUES ($1,$2,$3,'SEARCH_STARTED',clock_timestamp())",
        [nextEntityId(), ride.id, user],
      );
      await insertUserLog(tx, {
        actor_id: user,
        entity_type: 'Ride',
        entity_id: ride.id,
        action: 'REQUEST_RIDE',
        before_data: { status: ride.status },
        after_data: { status: updated.rows[0]!.status, quote_id: quote.id },
      });
      return {
        kind: 'success' as const,
        ride: { ...updated.rows[0]!, ...parts },
      };
    });

  readonly find_ride_for_user = (user: string, id: string) =>
    this.db.transaction(async (tx) => {
      const ride = await tx.query<RideRow>(
        `SELECT ${rideColumns},${rideParticipants} FROM rides r ${participantJoins} WHERE r.id=$1 AND r.rider_id=$2`,
        [id, user],
      );
      if (!ride.rows[0]) return null;
      const parts = await this.tripParts(tx, id);
      const events = await tx.query(
        'SELECT * FROM ride_events WHERE ride_id=$1 ORDER BY created_at',
        [id],
      );
      const reviews = await tx.query('SELECT * FROM reviews WHERE ride_id=$1', [
        id,
      ]);
      return {
        ...ride.rows[0],
        ...parts,
        events: events.rows,
        reviews: reviews.rows,
      };
    }, 'REPEATABLE READ');

  readonly list_rides_for_user = async (
    user: string,
    skip: number,
    take: number,
  ) =>
    (
      await this.db.query(
        `SELECT ${rideColumns},${rideParticipants} FROM rides r ${participantJoins}
      WHERE r.rider_id=$1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
        [user, take, skip],
      )
    ).rows;

  private async rideActivity(user: string, id: string, sql: string) {
    return this.db.transaction(async (tx) => {
      const owner = await tx.query(
        'SELECT id FROM rides WHERE id=$1 AND rider_id=$2',
        [id, user],
      );
      if (!owner.rowCount) return null;
      return (await tx.query(sql, [id])).rows;
    }, 'REPEATABLE READ');
  }

  readonly list_ride_events = (user: string, id: string) =>
    this.rideActivity(
      user,
      id,
      'SELECT * FROM ride_events WHERE ride_id=$1 ORDER BY created_at',
    );

  readonly list_ride_locations = (user: string, id: string) =>
    this.rideActivity(
      user,
      id,
      `SELECT l.*,trim_scale(latitude)::text AS latitude,
      trim_scale(longitude)::text AS longitude,trim_scale(speed_kph)::text AS speed_kph,
      trim_scale(heading)::text AS heading FROM (
        SELECT * FROM ride_locations WHERE ride_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 500
      ) l ORDER BY recorded_at,id`,
    );

  readonly create_review = (user: string, id: string, input: ReviewInput) =>
    this.db.transaction(async (tx) => {
      await rideLock(tx, 720044, id);
      const found = await tx.query<{
        status: string;
        driver_user: string | null;
      }>(
        'SELECT r.status,d.user_id AS driver_user FROM rides r LEFT JOIN driver_profiles d ON d.id=r.driver_id WHERE r.id=$1 AND r.rider_id=$2',
        [id, user],
      );
      const ride = found.rows[0];
      if (!ride) return { kind: 'ride_not_found' as const };
      if (ride.status !== 'COMPLETED')
        return { kind: 'not_completed' as const };
      if (!ride.driver_user || input.reviewee_id !== ride.driver_user)
        return { kind: 'invalid_recipient' as const };
      await rideLock(tx, 720043, ride.driver_user);
      const prior = await tx.query<{
        id: string;
        score: number;
        comment: string | null;
      }>(
        'SELECT * FROM reviews WHERE ride_id=$1 AND reviewer_id=$2 AND reviewee_id=$3',
        [id, user, input.reviewee_id],
      );
      const existing = prior.rows[0];
      if (existing) {
        if (
          existing.score !== input.score ||
          (existing.comment ?? '') !== (input.comment ?? '')
        )
          throw new AppError(
            409,
            'REVIEW_ALREADY_SUBMITTED',
            'A rating has already been submitted for this ride.',
          );
        return { kind: 'success' as const, review: existing };
      }
      const result = await tx.query<{ id: string; score: number }>(
        `INSERT INTO reviews (id,ride_id,reviewer_id,reviewee_id,score,comment,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()) RETURNING *`,
        [
          nextEntityId(),
          id,
          user,
          input.reviewee_id,
          input.score,
          input.comment,
        ],
      );
      const review = result.rows[0]!;
      const rating = await tx.query<{
        rating_average: string;
        ratings_count: number;
      }>(
        `UPDATE driver_profiles SET rating_average=s.average,ratings_count=s.total,updated_at=clock_timestamp()
        FROM (SELECT round(avg(score),2) AS average,count(*)::int AS total FROM reviews WHERE reviewee_id=$1) s
        WHERE user_id=$1 RETURNING rating_average,ratings_count`,
        [ride.driver_user],
      );
      const stats = rating.rows[0]!;
      await insertUserLog(tx, {
        actor_id: user,
        entity_type: 'Review',
        entity_id: review.id,
        action: 'CREATE_REVIEW',
        after_data: {
          ...review,
          driver_rating: {
            rating_average: Number(stats.rating_average),
            ratings_count: stats.ratings_count,
          },
        },
      });
      return { kind: 'success' as const, review };
    });
}
