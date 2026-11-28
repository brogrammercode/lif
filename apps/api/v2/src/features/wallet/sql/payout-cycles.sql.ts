import type { PayoutSchedule } from '../wallet.rows.js';
import type { SqlClient } from '../../../database/postgres.service.js';
import {
  unpaidEarningKind,
  unpaidEarningExclusions,
} from './wallet-ledger.sql.js';

export type ScheduleRow = Omit<PayoutSchedule, 'minimum_paise'> & {
  minimum_paise: string;
};
export const asSchedule = (row: ScheduleRow): PayoutSchedule => ({
  ...row,
  minimum_paise: BigInt(row.minimum_paise),
});
export async function readPayoutSchedule(db: SqlClient, id: string) {
  const {
    rows: [row],
  } = await db.query<ScheduleRow>(
    'SELECT * FROM payout_schedules WHERE id=$1',
    [id],
  );
  return row ? asSchedule(row) : null;
}

export async function lastPayoutCutoff(db: SqlClient, id: string) {
  const {
    rows: [last],
  } = await db.query<{ cutoff_at: Date }>(
    'SELECT cutoff_at FROM payout_cycles WHERE schedule_id=$1 ORDER BY cutoff_at DESC LIMIT 1',
    [id],
  );
  return last?.cutoff_at ?? null;
}

const unpaid = (cutoff: string) =>
  `${unpaidEarningKind} AND e.created_at<=${cutoff} AND ${unpaidEarningExclusions}`;
export const forecastPayouts = `WITH earnings AS (
    SELECT e.wallet_id,sum(e.available_delta_paise) AS credited,
      sum(CASE WHEN e.kind='CASH_PAYMENT' THEN -e.commission_paise ELSE e.available_delta_paise END) AS net,
      sum(COALESCE(e.commission_paise,0)) AS commission
    FROM wallet_entries e WHERE ${unpaid('$1')} GROUP BY e.wallet_id
  )
  SELECT u.id AS driver_id,trim(concat_ws(' ',u.first_name,u.last_name)) AS driver_name,
    (e.net+e.commission)::text AS gross_paise,e.commission::text AS commission_paise,e.net::text AS net_paise,
    CASE WHEN u.status<>'ACTIVE' OR u.deleted_at IS NOT NULL THEN 'Inactive account'
      WHEN EXISTS(SELECT 1 FROM payout_driver_blocks b WHERE b.driver_id=u.id
        AND (b.expires_at IS NULL OR b.expires_at>$2)) THEN 'Payout blocked'
      WHEN NOT EXISTS(SELECT 1 FROM driver_payout_methods m WHERE m.driver_id=u.id AND m.is_default
        AND ((m.status='VERIFIED' AND m.provider_fund_account_id IS NOT NULL)
          OR (m.status='PENDING' AND m.pending_details IS NOT NULL))) THEN 'Payout account required'
      WHEN e.net<$3::bigint OR e.net<100 THEN 'Below minimum'
      WHEN e.net>9007199254740991 THEN 'Amount exceeds limit'
      WHEN e.credited>w.available_paise THEN 'Insufficient available earnings'
      ELSE 'Eligible' END AS eligibility
  FROM earnings e JOIN wallets w ON w.id=e.wallet_id JOIN users u ON u.id=w.user_id
  ORDER BY e.net DESC,u.id LIMIT $4 OFFSET $5`;

export const insertPayoutDrafts = `WITH earnings AS MATERIALIZED (
    SELECT e.id,e.wallet_id,e.ride_id,e.kind,
      CASE WHEN e.kind='CASH_PAYMENT' THEN -e.commission_paise ELSE e.available_delta_paise END AS payout_amount
    FROM wallet_entries e JOIN wallets w ON w.id=e.wallet_id
    WHERE ${unpaid('$1')}
      AND NOT EXISTS(SELECT 1 FROM payout_driver_blocks b WHERE b.driver_id=w.user_id
        AND (b.expires_at IS NULL OR b.expires_at>$2))
  ), drafts AS (
    INSERT INTO driver_payouts (id,cycle_id,wallet_id,amount_paise,status,created_at,updated_at)
    SELECT gen_random_uuid()::text,$3,wallet_id,sum(payout_amount)::bigint,'DRAFT',now(),now()
    FROM earnings GROUP BY wallet_id HAVING sum(payout_amount)>0 RETURNING id,wallet_id
  )
  INSERT INTO driver_payout_lines (id,payout_id,source_entry_id,ride_id,amount_paise,reason,created_at)
  SELECT gen_random_uuid()::text,drafts.id,earnings.id,earnings.ride_id,earnings.payout_amount,
    CASE WHEN earnings.kind='CASH_PAYMENT' THEN 'Cash ride commission' END,now()
  FROM earnings JOIN drafts USING(wallet_id)`;
