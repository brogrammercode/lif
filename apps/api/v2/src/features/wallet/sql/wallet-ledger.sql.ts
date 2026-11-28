export const unpaidEarningKind = `((e.kind='RIDE_EARNING' AND e.available_delta_paise>0)
  OR (e.kind='CASH_PAYMENT' AND e.commission_paise>0 AND e.external_amount_paise>0))`;
export const unpaidEarningExclusions = `NOT EXISTS(
    SELECT 1 FROM payments payment WHERE payment.id=e.payment_id
      AND payment.provider='razorpay-ride' AND payment.status IN ('REFUNDED','PARTIALLY_REFUNDED'))
  AND NOT EXISTS(
    SELECT 1 FROM wallet_entries r WHERE r.reverses_entry_id=e.id AND r.kind='REFUND')
  AND NOT EXISTS(
    SELECT 1 FROM driver_payout_lines l JOIN driver_payouts p ON p.id=l.payout_id
    WHERE l.source_entry_id=e.id AND p.status NOT IN ('EXCLUDED','FAILED','REVERSED'))`;

export const walletRow = `SELECT id,currency,available_paise::text,held_paise::text
  FROM wallets WHERE user_id=$1 AND kind=$2`;

const entry = `jsonb_build_object(
  'id',e.id,'kind',e.kind,
  'available_delta_paise',e.available_delta_paise::text,'held_delta_paise',e.held_delta_paise::text,
  'available_after_paise',e.available_after_paise::text,'held_after_paise',e.held_after_paise::text,
  'created_at',to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'reversed',EXISTS(SELECT 1 FROM wallet_entries r WHERE r.reverses_entry_id=e.id AND r.kind='REFUND')
) || jsonb_strip_nulls(jsonb_build_object(
  'ride_id',e.ride_id,'payment_id',e.payment_id,'topup_id',e.topup_id,'payout_id',e.payout_id,
  'reverses_entry_id',e.reverses_entry_id,'external_amount_paise',e.external_amount_paise::text
)) || CASE WHEN e.commission_paise IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
  'gross_paise',COALESCE(e.external_amount_paise,e.available_delta_paise+e.commission_paise)::text,
  'commission_paise',e.commission_paise::text,
  'commission_percent',trim_scale(e.commission_percent)::text,
  'driver_net_paise',COALESCE(e.external_amount_paise-e.commission_paise,e.available_delta_paise)::text
) END`;

const topup = `jsonb_build_object(
  'id',t.id,'status',t.status,'amount_paise',t.amount_paise::text,'failure_reason',t.failure_reason,
  'checkout_kind',t.checkout_kind,'provider_mode',t.provider_mode,'provider_link_id',t.provider_link_id,
  'provider_order_id',t.provider_order_id,'provider_payment_id',t.provider_payment_id,
  'created_at',to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'updated_at',to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)`;

const entryFilters = `e.wallet_id=$1 AND ($2::"WalletEntryKind" IS NULL OR e.kind=$2)
  AND ($3::timestamptz IS NULL OR e.created_at >= $3)
  AND ($4::timestamptz IS NULL OR e.created_at < $4)`;
const references =
  'e.id,e.ride_id,e.payment_id,e.topup_id,e.payout_id,e.reverses_entry_id';
const providerReferences =
  't.provider_link_id,t.provider_order_id,t.provider_payment_id';

export const ledgerEntries = `SELECT ${entry} AS entry FROM wallet_entries e
  WHERE ${entryFilters} AND ($5::text IS NULL OR $5 IN (${references}))
  ORDER BY e.created_at DESC,e.id DESC LIMIT $6 OFFSET $7`;

export const ledgerTimeline = `WITH visible AS (
  SELECT id,created_at,source FROM (
    SELECT e.id,e.created_at,'entry' AS source FROM wallet_entries e
    LEFT JOIN wallet_topups t ON t.id=e.topup_id AND t.wallet_id=e.wallet_id
    WHERE ${entryFilters} AND ($5::text IS NULL OR $5 IN (${references},${providerReferences}))
    UNION ALL
    SELECT t.id,t.created_at,'attempt' AS source FROM wallet_topups t
    WHERE $8::boolean AND t.wallet_id=$1
      AND ($3::timestamptz IS NULL OR t.created_at >= $3)
      AND ($4::timestamptz IS NULL OR t.created_at < $4)
      AND ($5::text IS NULL OR $5 IN (t.id,${providerReferences}))
      AND NOT EXISTS (SELECT 1 FROM wallet_entries credit WHERE credit.wallet_id=t.wallet_id
        AND credit.topup_id=t.id AND credit.kind='TOP_UP')
  ) attempts
  ORDER BY created_at DESC,id DESC,source DESC LIMIT $6 OFFSET $7
)
SELECT v.id,v.source,v.created_at,
  CASE WHEN e.id IS NOT NULL THEN ${entry} END AS entry,
  CASE WHEN t.id IS NOT NULL AND (v.source='attempt' OR e.kind='TOP_UP') THEN ${topup} END AS topup
FROM visible v
LEFT JOIN wallet_entries e ON v.source='entry' AND e.id=v.id AND e.wallet_id=$1
LEFT JOIN wallet_topups t ON t.id=CASE WHEN v.source='attempt' THEN v.id ELSE e.topup_id END AND t.wallet_id=$1
ORDER BY v.created_at DESC,v.id DESC,v.source DESC`;

export const driverEarnings = `SELECT COALESCE(sum(e.available_delta_paise),0)::text AS earnings_paise
  FROM wallet_entries e WHERE e.wallet_id=$1 AND e.kind='RIDE_EARNING'
    AND NOT EXISTS(SELECT 1 FROM wallet_entries r WHERE r.reverses_entry_id=e.id AND r.kind='REFUND')`;

export const driverBalance = `WITH pending AS (
    SELECT COALESCE(sum(e.available_delta_paise),0) AS funded,
      COALESCE(sum(CASE WHEN e.kind='CASH_PAYMENT' THEN e.commission_paise ELSE 0 END),0) AS commission
    FROM wallet_entries e WHERE e.wallet_id=$1 AND ${unpaidEarningKind}
      AND e.created_at<=$3 AND ${unpaidEarningExclusions}
  ), drafts AS (
    SELECT COALESCE(sum(p.amount_paise),0) AS net FROM driver_payouts p WHERE p.wallet_id=$1 AND p.status='DRAFT'
  ), draft_funding AS (
    SELECT COALESCE(sum(l.amount_paise),0) AS funded FROM driver_payout_lines l
    JOIN driver_payouts p ON p.id=l.payout_id JOIN wallet_entries e ON e.id=l.source_entry_id
    WHERE p.wallet_id=$1 AND p.status='DRAFT' AND e.kind='RIDE_EARNING'
  ), paid AS (
    SELECT max(c.cutoff_at) AS cutoff FROM driver_payouts p JOIN payout_cycles c ON c.id=p.cycle_id
    WHERE p.wallet_id=$1 AND p.status='PAID'
  ), cash AS (
    SELECT COALESCE(sum(e.external_amount_paise),0) AS collected FROM wallet_entries e CROSS JOIN paid
    WHERE e.wallet_id=$1 AND e.kind='CASH_PAYMENT' AND e.external_amount_paise>0 AND e.created_at<=$3
      AND (paid.cutoff IS NULL OR e.created_at>paid.cutoff)
      AND NOT EXISTS(SELECT 1 FROM wallet_entries r WHERE r.reverses_entry_id=e.id AND r.kind='REFUND')
  ) SELECT greatest(0,least($2::bigint,pending.funded+draft_funding.funded)
     - pending.commission + drafts.net - draft_funding.funded)::text AS payout_available_paise,
     cash.collected::text AS cash_collected_paise
  FROM pending CROSS JOIN drafts CROSS JOIN draft_funding CROSS JOIN cash`;
