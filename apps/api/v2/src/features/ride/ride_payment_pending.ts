import type { Prisma } from '@prisma/client';

export const ride_payment_pending = {
  status: 'COMPLETED',
  driver_id: { not: null },
  final_fare: { gt: 0 },
  OR: [
    { payment: { is: null } },
    {
      payment: {
        is: {
          status: {
            in: ['PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'FAILED'],
          },
        },
      },
    },
  ],
} satisfies Prisma.RideWhereInput;

export const resumable_ride_order: Prisma.RideOrderByWithRelationInput[] = [
  { completed_at: { sort: 'asc', nulls: 'first' } },
  { created_at: 'asc' },
  { id: 'asc' },
];
