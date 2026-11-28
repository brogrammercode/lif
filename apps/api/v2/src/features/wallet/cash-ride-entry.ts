import type { JsonValue } from '../../database/json-value.js';
import { Decimal } from 'decimal.js';
import type { SqlClient } from '../../database/postgres.service.js';
import { nextEntityId } from '../../database/entity-id.js';
import { AppError } from '../../core/error.js';

function snapshot_commission(snapshot: JsonValue | undefined) {
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
  snapshot: JsonValue | undefined,
) {
  const percent = snapshot_commission(snapshot);
  const commission = BigInt(
    new Decimal(amount.toString())
      .mul(percent)
      .div(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toFixed(0),
  );
  return {
    percent,
    commission:
      amount > 0n && percent > 0 && commission === 0n ? 1n : commission,
  };
}

export async function record_cash_ride(
  tx: SqlClient,
  input: {
    ride_id: string;
    payment_id: string;
    rider_id: string;
    driver_user_id: string;
    fare: Decimal;
    snapshot: JsonValue | undefined;
  },
) {
  const amount = BigInt(input.fare.mul(100).toFixed(0));
  const { percent, commission } = ride_commission(amount, input.snapshot);
  await tx.query(
    `INSERT INTO wallets (id,user_id,kind) VALUES ($1,$2,'RIDER'),($3,$4,'DRIVER')
      ON CONFLICT(user_id,kind) DO NOTHING`,
    [nextEntityId(), input.rider_id, nextEntityId(), input.driver_user_id],
  );
  const { rows: wallets } = await tx.query<{
    id: string;
    kind: 'RIDER' | 'DRIVER';
    available_paise: string;
    held_paise: string;
  }>(
    `SELECT id,kind,available_paise,held_paise FROM wallets
      WHERE (user_id=$1 AND kind='RIDER') OR (user_id=$2 AND kind='DRIVER')
      ORDER BY id FOR UPDATE`,
    [input.rider_id, input.driver_user_id],
  );
  if (wallets.length !== 2)
    throw new Error('Cash collection wallets could not be locked');
  for (const wallet of wallets) {
    const isDriver = wallet.kind === 'DRIVER';
    await tx.query(
      `INSERT INTO wallet_entries (id,wallet_id,kind,ride_id,payment_id,operation_key,
        external_amount_paise,available_delta_paise,held_delta_paise,available_after_paise,
        held_after_paise,commission_paise,commission_percent)
        VALUES ($1,$2,'CASH_PAYMENT',$3,$4,$5,$6,0,0,$7,$8,$9,$10)`,
      [
        nextEntityId(),
        wallet.id,
        input.ride_id,
        input.payment_id,
        `ride:${input.ride_id}:cash:${wallet.kind}`,
        String(isDriver ? amount : -amount),
        wallet.available_paise,
        wallet.held_paise,
        isDriver ? String(commission) : null,
        isDriver ? percent : null,
      ],
    );
  }
}
