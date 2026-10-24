import { Injectable } from '@nestjs/common';
import { Prisma, type RideStatus } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AppError } from '../../core/error.js';

export const RIDER_ACTIVE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'SEARCHING',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_WAITING',
  'IN_PROGRESS',
];
export const DRIVER_ACTIVE_STATUSES: RideStatus[] = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_WAITING',
  'IN_PROGRESS',
];
const summary = {
  id: true,
  status: true,
  pickup_address: true,
  dropoff_address: true,
  requested_at: true,
  created_at: true,
} as const;
const driver_ride = {
  ...summary,
  pickup_latitude: true,
  pickup_longitude: true,
  dropoff_latitude: true,
  dropoff_longitude: true,
  matched_at: true,
  arrived_at: true,
  started_at: true,
  completed_at: true,
  cancelled_at: true,
  cancel_reason: true,
  estimated_distance_m: true,
  estimated_duration_s: true,
  actual_distance_m: true,
  actual_duration_s: true,
  estimated_fare: true,
  final_fare: true,
  currency: true,
  rider_note: true,
  rider: {
    select: { id: true, first_name: true, last_name: true, avatar_url: true },
  },
  vehicle: {
    select: {
      id: true,
      make: true,
      model: true,
      plate_number: true,
      color: true,
      type: true,
    },
  },
  route: true,
  payment: { select: { status: true } },
  events: {
    select: { id: true, event_type: true, created_at: true },
    orderBy: { created_at: 'asc' },
  },
} satisfies Prisma.RideSelect;

@Injectable()
export class TravelContextService {
  constructor(private readonly database: PrismaService) {}
  async context(user_id: string) {
    return this.database.client.$transaction(
      async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: user_id },
          select: {
            role: true,
            partner_activated_at: true,
            partner_application: { select: { status: true } },
            driver_profile: { select: { availability: true } },
          },
        });
        const [rider_ride, driver_trip] = await Promise.all([
          tx.ride.findFirst({
            where: { rider_id: user_id, status: { in: RIDER_ACTIVE_STATUSES } },
            select: summary,
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          }),
          tx.ride.findFirst({
            where: {
              driver: { user_id },
              status: { in: DRIVER_ACTIVE_STATUSES },
            },
            select: summary,
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          }),
        ]);
        return {
          can_enter_driver_mode:
            user.role === 'DRIVER' ||
            !!user.partner_activated_at ||
            user.partner_application?.status === 'EXITED',
          driver_operations_allowed:
            user.partner_application?.status !== 'EXITED' &&
            (user.role === 'DRIVER' || !!user.partner_activated_at),
          driver_availability: user.driver_profile?.availability ?? null,
          active_rider_ride: rider_ride,
          active_driver_ride: driver_trip,
          mode_switch_allowed: !rider_ride && !driver_trip,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 10000,
        timeout: 15000,
      },
    );
  }
  async current(user_id: string) {
    return this.database.client.ride.findFirst({
      where: { driver: { user_id }, status: { in: DRIVER_ACTIVE_STATUSES } },
      select: driver_ride,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }
  async rider_history(
    user_id: string,
    page: number,
    page_size: number,
    section: 'all' | 'active' | 'past',
  ) {
    const where: Prisma.RideWhereInput = {
      rider_id: user_id,
      status:
        section === 'active'
          ? { in: RIDER_ACTIVE_STATUSES }
          : section === 'past'
            ? { notIn: ['DRAFT', ...RIDER_ACTIVE_STATUSES] }
            : { not: 'DRAFT' },
    };
    const [rows, total] = await this.database.client.$transaction(
      [
        this.database.client.ride.findMany({
          where,
          select: {
            ...summary,
            final_fare: true,
            estimated_fare: true,
            currency: true,
            payment: { select: { status: true } },
            quotes: {
              where: { selected_at: { not: null } },
              select: { category_snapshot: true },
              take: 1,
            },
          },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * page_size,
          take: page_size,
        }),
        this.database.client.ride.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { rows, total, page, page_size };
  }
  async list(user_id: string, page: number, page_size: number) {
    const where = { driver: { user_id } };
    const [rows, total] = await this.database.client.$transaction([
      this.database.client.ride.findMany({
        where,
        select: {
          ...summary,
          final_fare: true,
          estimated_fare: true,
          currency: true,
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * page_size,
        take: page_size,
      }),
      this.database.client.ride.count({ where }),
    ]);
    return { rows, total, page, page_size };
  }
  async detail(user_id: string, id: string) {
    const ride = await this.database.client.ride.findFirst({
      where: { id, driver: { user_id } },
      select: driver_ride,
    });
    if (!ride)
      throw new AppError(
        404,
        'DRIVER_RIDE_NOT_FOUND',
        'This ride is not assigned to your driver account.',
      );
    return ride;
  }
}
