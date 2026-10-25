import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Prisma, type VehicleType } from '@prisma/client';
import { create_user_log } from '../../infra/database/user_log.js';
import { DEFAULT_CURRENCY } from '../../core/constants.js';
import { ROUTE_PROVIDER } from './ride.constant.js';
import { AppError } from '../../core/error.js';
import { require_supported_ride_payment } from '../app_configuration/payment_policy.js';
import { require_active_account } from '../../infra/database/account_lifecycle.js';
import { CATEGORY_MESSAGES } from '../vehicle_category/vehicle_category.constant.js';
import {
  rider_driver_select,
  rider_vehicle_select,
} from './ride.presentation.js';
import {
  CONFIGURATION_KEY,
  FARE_POLICY_LOCK,
} from '../app_configuration/app_configuration.type.js';
import type { CreateRideInput, QuoteInput, ReviewInput } from './ride.type.js';
export type FareCalculation = {
  distance_m: number;
  duration_s: number;
  vehicle_type: VehicleType;
  vehicle_category_id: string;
  category_updated_at?: string;
  fare_policy_version?: number;
  category_snapshot: Prisma.InputJsonObject;
  pickup_eta_s: number;
  base_fare: number;
  distance_fare: number;
  time_fare: number;
  total_fare: number;
};
@Injectable()
export class RideRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly create_quote = async (
    user_id: string,
    input: QuoteInput,
    calculations: FareCalculation[],
    expires_at: Date,
    geometry: unknown,
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
        // HTTP quote calculations always carry a policy version. Keep the
        // internal legacy snapshot contract usable without repricing old data.
        if (
          calculations.some((item) => item.fare_policy_version !== undefined)
        ) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${FARE_POLICY_LOCK}::integer)`;
          const policy = await tx.rideFarePolicy.findUnique({
            where: { key: CONFIGURATION_KEY },
            select: { version: true },
          });
          if (
            calculations.some(
              (item) => item.fare_policy_version !== (policy?.version ?? 0),
            )
          ) {
            throw new AppError(
              409,
              'FARE_POLICY_CHANGED',
              'The fare policy changed. Request fresh ride options.',
            );
          }
        }
        const available = await tx.vehicleCategory.findMany({
          where: {
            id: { in: calculations.map((item) => item.vehicle_category_id) },
            is_active: true,
            children: { none: {} },
            OR: [{ parent_id: null }, { parent: { is_active: true } }],
          },
        });
        if (
          !calculations.length ||
          available.length !== calculations.length ||
          calculations.some((calculation) => {
            const category = available.find(
              (item) => item.id === calculation.vehicle_category_id,
            );
            return (
              !category ||
              category.vehicle_type !== calculation.vehicle_type ||
              (calculation.category_updated_at &&
                category.updated_at.toISOString() !==
                  calculation.category_updated_at)
            );
          })
        )
          throw new AppError(
            409,
            'CATEGORY_UNAVAILABLE',
            CATEGORY_MESSAGES.UNAVAILABLE,
          );
        const ride = await tx.ride.create({
          data: {
            rider_id: user_id,
            status: 'DRAFT',
            pickup_address: input.pickup.address,
            pickup_latitude: input.pickup.latitude,
            pickup_longitude: input.pickup.longitude,
            dropoff_address: input.dropoff.address,
            dropoff_latitude: input.dropoff.latitude,
            dropoff_longitude: input.dropoff.longitude,
            rider_note: input.rider_note,
            estimated_distance_m: calculations[0]?.distance_m,
            estimated_duration_s: calculations[0]?.duration_s,
            currency: DEFAULT_CURRENCY,
            route: {
              create: {
                provider: ROUTE_PROVIDER,
                distance_m: calculations[0]?.distance_m ?? 0,
                duration_s: calculations[0]?.duration_s ?? 0,
                route_data: {
                  pickup: input.pickup,
                  dropoff: input.dropoff,
                  geometry,
                } as Prisma.InputJsonObject,
              },
            },
            quotes: {
              create: calculations.map((calculation) => ({
                vehicle_type: calculation.vehicle_type,
                vehicle_category_id: calculation.vehicle_category_id,
                category_snapshot: calculation.category_snapshot,
                distance_m: calculation.distance_m,
                duration_s: calculation.duration_s,
                pickup_eta_s: calculation.pickup_eta_s,
                base_fare: calculation.base_fare,
                distance_fare: calculation.distance_fare,
                time_fare: calculation.time_fare,
                total_fare: calculation.total_fare,
                currency: DEFAULT_CURRENCY,
                expires_at,
              })),
            },
          },
          include: { quotes: true, route: true },
        });
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'Ride',
          entity_id: ride.id,
          action: 'CREATE_RIDE_QUOTE',
          after_data: {
            quote_count: calculations.length,
          } as Prisma.InputJsonObject,
        });
        return ride;
      },
      { maxWait: 10000, timeout: 10000 },
    );

  readonly request_ride = async (user_id: string, input: CreateRideInput) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720054, hashtext(${user_id}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${input.draft_ride_id}))`;
        const ride = await tx.ride.findFirst({
          where: { id: input.draft_ride_id, rider_id: user_id },
          include: { quotes: true },
        });
        if (!ride) return { kind: 'ride_not_found' as const };
        if (ride.status !== 'DRAFT') return { kind: 'invalid_state' as const };
        if (
          await tx.ride.findFirst({
            where: {
              OR: [{ rider_id: user_id }, { driver: { user_id } }],
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
              id: { not: ride.id },
            },
            select: { id: true },
          })
        ) {
          throw new AppError(
            409,
            'ACTIVE_RIDE_EXISTS',
            'Finish or cancel your current ride before requesting another.',
          );
        }
        const driving = await tx.driverProfile.findUnique({
          where: { user_id },
          select: { availability: true },
        });
        if (driving && !['OFFLINE', 'SUSPENDED'].includes(driving.availability))
          throw new AppError(
            409,
            'DRIVER_MUST_GO_OFFLINE',
            'Switch to rider mode and go offline before booking a ride.',
          );
        const quote = ride.quotes.find((item) => item.id === input.quote_id);
        if (!quote) return { kind: 'quote_not_found' as const };
        if (quote.expires_at.getTime() <= Date.now())
          return { kind: 'quote_expired' as const };
        const payment_method = input.payment_method_id
          ? await tx.paymentMethod.findFirst({
              where: { id: input.payment_method_id, user_id },
              select: { id: true, type: true },
            })
          : null;
        if (input.payment_method_id && !payment_method)
          return { kind: 'payment_method_not_found' as const };
        require_supported_ride_payment(
          quote.category_snapshot,
          payment_method?.type ?? input.payment_preference ?? 'CASH',
        );
        if (!quote.vehicle_category_id)
          return { kind: 'quote_unavailable' as const };
        if (quote.vehicle_category_id) {
          const category = await tx.vehicleCategory.findUnique({
            where: { id: quote.vehicle_category_id },
            include: { parent: true, _count: { select: { children: true } } },
          });
          if (
            !category ||
            !category.is_active ||
            (category.parent && !category.parent.is_active) ||
            category._count.children > 0
          )
            return { kind: 'quote_unavailable' as const };
        }
        const claimed = await tx.ride.updateMany({
          where: { id: ride.id, rider_id: user_id, status: 'DRAFT' },
          data: {
            status: 'SEARCHING',
            rider_note: input.rider_note ?? ride.rider_note,
            payment_method_id: input.payment_method_id,
            collection_preference:
              payment_method?.type ?? input.payment_preference ?? 'CASH',
            requested_at: new Date(),
            estimated_fare: quote.total_fare,
          },
        });
        if (claimed.count !== 1) return { kind: 'invalid_state' as const };
        await tx.fareQuote.update({
          where: { id: quote.id },
          data: { selected_at: new Date() },
        });
        const updated = await tx.ride.findUniqueOrThrow({
          where: { id: ride.id },
          include: { quotes: true, route: true },
        });
        await tx.rideEvent.create({
          data: {
            ride_id: ride.id,
            actor_id: user_id,
            event_type: 'SEARCH_STARTED',
          },
        });
        await create_user_log(tx, {
          actor_id: user_id,
          entity_type: 'Ride',
          entity_id: ride.id,
          action: 'REQUEST_RIDE',
          before_data: { status: ride.status } as Prisma.InputJsonObject,
          after_data: {
            status: updated.status,
            quote_id: quote.id,
          } as Prisma.InputJsonObject,
        });
        return { kind: 'success' as const, ride: updated };
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly find_ride_for_user = async (user_id: string, ride_id: string) =>
    this.prismaService.client.ride.findFirst({
      where: { id: ride_id, rider_id: user_id },
      include: {
        route: true,
        quotes: true,
        driver: { select: rider_driver_select },
        vehicle: { select: rider_vehicle_select },
        events: { orderBy: { created_at: 'asc' } },
        payment: true,
        reviews: true,
      },
    });

  readonly list_rides_for_user = async (
    user_id: string,
    skip: number,
    take: number,
  ) =>
    this.prismaService.client.ride.findMany({
      where: { rider_id: user_id },
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: {
        driver: { select: rider_driver_select },
        vehicle: { select: rider_vehicle_select },
        payment: true,
      },
    });

  readonly list_ride_events = async (user_id: string, ride_id: string) => {
    const ride = await this.prismaService.client.ride.findFirst({
      where: { id: ride_id, rider_id: user_id },
      select: { id: true },
    });
    if (!ride) return null;
    return this.prismaService.client.rideEvent.findMany({
      where: { ride_id },
      orderBy: { created_at: 'asc' },
    });
  };

  readonly list_ride_locations = async (user_id: string, ride_id: string) => {
    const ride = await this.prismaService.client.ride.findFirst({
      where: { id: ride_id, rider_id: user_id },
      select: { id: true },
    });
    if (!ride) return null;
    const latest = await this.prismaService.client.rideLocation.findMany({
      where: { ride_id },
      orderBy: [{ recorded_at: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return latest.reverse();
  };

  readonly create_review = async (
    user_id: string,
    ride_id: string,
    input: ReviewInput,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${ride_id}))`;
      const ride = await tx.ride.findFirst({
        where: { id: ride_id, rider_id: user_id },
        include: { driver: { select: { user_id: true } } },
      });
      if (!ride) return { kind: 'ride_not_found' as const };
      if (ride.status !== 'COMPLETED')
        return { kind: 'not_completed' as const };
      if (!ride.driver || input.reviewee_id !== ride.driver.user_id)
        return { kind: 'invalid_recipient' as const };
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${ride.driver.user_id}))`;
      const existing = await tx.review.findUnique({
        where: {
          ride_id_reviewer_id_reviewee_id: {
            ride_id,
            reviewer_id: user_id,
            reviewee_id: input.reviewee_id,
          },
        },
      });
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
      const review = await tx.review.create({
        data: {
          ride_id,
          reviewer_id: user_id,
          reviewee_id: input.reviewee_id,
          score: input.score,
          comment: input.comment,
        },
      });
      const statistics = await tx.review.aggregate({
        where: { reviewee_id: ride.driver.user_id },
        _avg: { score: true },
        _count: { _all: true },
      });
      const driver_rating = await tx.driverProfile.update({
        where: { user_id: ride.driver.user_id },
        data: {
          rating_average: new Prisma.Decimal(statistics._avg.score ?? 0)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .toNumber(),
          ratings_count: statistics._count._all,
        },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Review',
        entity_id: review.id,
        action: 'CREATE_REVIEW',
        after_data: {
          ...review,
          driver_rating: {
            rating_average: driver_rating.rating_average.toNumber(),
            ratings_count: driver_rating.ratings_count,
          },
        } as unknown as Prisma.InputJsonObject,
      });
      return { kind: 'success' as const, review };
    });
}
