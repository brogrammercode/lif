import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const rides_query = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    status: z.enum(['all', 'active', 'completed', 'cancelled']).default('all'),
  })
  .strict();

// Deliberately excludes OTPs, location trails, chat and private payout data.
export const ride_person = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
  phone_e164: true,
} satisfies Prisma.UserSelect;
export const admin_ride_select = {
  id: true,
  status: true,
  created_at: true,
  requested_at: true,
  matched_at: true,
  arrived_at: true,
  started_at: true,
  completed_at: true,
  cancelled_at: true,
  cancel_reason: true,
  pickup_address: true,
  dropoff_address: true,
  estimated_distance_m: true,
  actual_distance_m: true,
  estimated_fare: true,
  final_fare: true,
  currency: true,
  rider: { select: ride_person },
  driver: { select: { user: { select: ride_person } } },
  vehicle: {
    select: {
      plate_number: true,
      make: true,
      model: true,
      vehicle_category: { select: { name: true } },
    },
  },
  payment: { select: { status: true, collection_method: true } },
} satisfies Prisma.RideSelect;

export function account_is_driver(user: {
  role: string;
  partner_activated_at: Date | null;
}) {
  return user.role === 'DRIVER' || Boolean(user.partner_activated_at);
}
export function rides_status_filter(
  status: z.infer<typeof rides_query>['status'],
): Prisma.RideWhereInput {
  if (status === 'completed') return { status: 'COMPLETED' };
  if (status === 'cancelled')
    return { status: { in: ['CANCELLED', 'EXPIRED', 'NO_DRIVER_FOUND'] } };
  if (status === 'active')
    return {
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
    };
  return {};
}
