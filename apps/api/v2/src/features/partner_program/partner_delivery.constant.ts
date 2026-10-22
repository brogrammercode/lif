import type { Prisma } from '@prisma/client';

// The lease exceeds SMTP's connection/greeting/socket timeouts. A conditional
// update, shared by the queue and worker, prevents a retry stealing a live send.
export function claimable_delivery(
  now = new Date(),
): Prisma.PartnerDeliveryWhereInput {
  const expired = new Date(now.getTime() - 300000);
  return {
    OR: [
      { status: { in: ['PENDING', 'FAILED'] } },
      { status: 'SENDING', claimed_at: { lt: expired } },
      { status: 'SENDING', claimed_at: null, updated_at: { lt: expired } },
    ],
  };
}
