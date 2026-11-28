import type { WalletTopUp } from '../wallet.rows.js';
import { nextEntityId } from '../../../database/entity-id.js';
import type { SqlClient } from '../../../database/postgres.service.js';
import { AppError } from '../../../core/error.js';

type TopupRow = Omit<
  WalletTopUp,
  'amount_paise' | 'credited_net_of_refund_paise' | 'reviewed_chargeback_paise'
> & {
  amount_paise: string;
  credited_net_of_refund_paise: string;
  reviewed_chargeback_paise: string;
};

export function topupFromRow(row: TopupRow): WalletTopUp {
  return {
    ...row,
    amount_paise: BigInt(row.amount_paise),
    credited_net_of_refund_paise: BigInt(row.credited_net_of_refund_paise),
    reviewed_chargeback_paise: BigInt(row.reviewed_chargeback_paise),
  };
}

export async function topupRows(
  db: SqlClient,
  sql: string,
  values: readonly unknown[] = [],
) {
  return (await db.query<TopupRow>(sql, values)).rows.map(topupFromRow);
}

export async function requiredTopup(db: SqlClient, id: string) {
  const [row] = await topupRows(db, 'SELECT * FROM wallet_topups WHERE id=$1', [
    id,
  ]);
  if (!row) throw new AppError(404, 'TOPUP_NOT_FOUND', 'Top-up not found.');
  return row;
}

export const ownTopups = `FROM wallet_topups t JOIN wallets w ON w.id=t.wallet_id
  WHERE w.user_id=$1 AND w.kind='RIDER'`;
export const walletDisputes = `FROM wallet_provider_events
  WHERE provider='razorpay-wallet' AND subject_id=$1 AND event_type='payment.dispute.created'
    AND reconciled_at IS NULL`;

export async function applyTopupDelta(
  tx: SqlClient,
  input: {
    walletId: string;
    topupId: string;
    operationKey: string;
    delta: bigint;
    reverses?: string;
  },
) {
  const {
    rows: [balance],
  } = await tx.query<{ available_paise: string; held_paise: string }>(
    'UPDATE wallets SET available_paise=available_paise+$2 WHERE id=$1 RETURNING available_paise,held_paise',
    [input.walletId, String(input.delta)],
  );
  if (!balance)
    throw new Error('Wallet missing during top-up ledger transaction');
  await tx.query(
    `INSERT INTO wallet_entries (id,wallet_id,kind,topup_id,operation_key,reverses_entry_id,
      available_delta_paise,held_delta_paise,available_after_paise,held_after_paise)
    VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9)`,
    [
      nextEntityId(),
      input.walletId,
      input.reverses ? 'REFUND' : 'TOP_UP',
      input.topupId,
      input.operationKey,
      input.reverses ?? null,
      String(input.delta),
      balance.available_paise,
      balance.held_paise,
    ],
  );
}
