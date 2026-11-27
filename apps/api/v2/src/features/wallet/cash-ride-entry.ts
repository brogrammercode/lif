import { Prisma } from '@prisma/client';
import type { TransactionClient } from '../../infra/database/client.js';
import { AppError } from '../../core/error.js';

function snapshot_commission(snapshot: Prisma.JsonValue | undefined) {
  const policy =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? snapshot.payment_policy
      : null;
  const percent =
    policy && typeof policy === 'object' && !Array.isArray(policy)
      ? policy.commission_percent
      : null;
  if (percent == null) return 0;
  if (
    typeof percent !== 'number' ||
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100
  )
    throw new AppError(
      409,
      'RIDE_COMMISSION_INVALID',
      'The ride commission must be reviewed before collection.',
    );
  return percent;
}

export function ride_commission(
  amount: bigint,
  snapshot: Prisma.JsonValue | undefined,
) {
  const percent = snapshot_commission(snapshot);
  const commission = BigInt(
    new Prisma.Decimal(amount.toString())
      .mul(percent)
      .div(100)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(0),
  );
  return { percent, commission };
}

export async function record_cash_ride(
  tx: TransactionClient,
  input: {
    ride_id: string;
    payment_id: string;
    rider_id: string;
    driver_user_id: string;
    fare: Prisma.Decimal;
    snapshot: Prisma.JsonValue | undefined;
  },
) {
  const amount = BigInt(input.fare.mul(100).toFixed(0));
  const { percent, commission } = ride_commission(amount, input.snapshot);
  for (const [kind, user_id, direction] of [
    ['RIDER', input.rider_id, -1n],
    ['DRIVER', input.driver_user_id, 1n],
  ] as const) {
    const { id } = await tx.wallet.upsert({
      where: { user_id_kind: { user_id, kind } },
      create: { user_id, kind },
      update: {},
      select: { id: true },
    });
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${id} FOR UPDATE`;
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id } });
    await tx.walletEntry.create({
      data: {
        wallet_id: id,
        kind: 'CASH_PAYMENT',
        ride_id: input.ride_id,
        payment_id: input.payment_id,
        operation_key: `ride:${input.ride_id}:cash:${kind}`,
        external_amount_paise: direction * amount,
        available_delta_paise: 0n,
        held_delta_paise: 0n,
        available_after_paise: wallet.available_paise,
        held_after_paise: wallet.held_paise,
        ...(kind === 'DRIVER'
          ? { commission_paise: commission, commission_percent: percent }
          : {}),
      },
    });
  }
}
