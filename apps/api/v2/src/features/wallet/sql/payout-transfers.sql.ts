export const approvePayoutCycle = `UPDATE payout_cycles SET status='READY',approved_at=clock_timestamp(),
approved_by_id=$3,version=version+1 WHERE id=$1 AND version=$2 AND status='DRAFT'`;

export const listDuePayoutAttempts = `SELECT id FROM driver_payout_attempts WHERE status IN ('READY','PROCESSING')
AND (next_retry_at IS NULL OR next_retry_at <= $1)
AND ($2::boolean OR provider_payout_id IS NOT NULL OR first_submitted_at <= $3)
ORDER BY next_retry_at NULLS LAST,id LIMIT 3`;

export const approveAutomaticCycle = `UPDATE payout_cycles SET status='READY',version=version+1
WHERE id=(SELECT id FROM payout_cycles WHERE status='DRAFT'
AND schedule_snapshot->'require_approval'='false'::jsonb ORDER BY scheduled_at,id LIMIT 1)`;

export const listEmptyApprovedCycles = `SELECT c.id FROM payout_cycles c WHERE c.status='READY' AND NOT EXISTS
(SELECT 1 FROM driver_payouts p WHERE p.cycle_id=c.id AND p.status <> 'EXCLUDED')
ORDER BY c.scheduled_at,c.id LIMIT 3`;

export const selectDraftTransfers = `SELECT p.id,p.cycle_id,p.wallet_id,p.amount_paise,c.schedule_snapshot,w.user_id,
(u.status <> 'ACTIVE' OR u.deleted_at IS NOT NULL) AS inactive,
(b.driver_id IS NOT NULL AND (b.expires_at IS NULL OR b.expires_at > statement_timestamp())) AS blocked
FROM driver_payouts p JOIN payout_cycles c ON c.id=p.cycle_id
JOIN wallets w ON w.id=p.wallet_id JOIN users u ON u.id=w.user_id
LEFT JOIN payout_driver_blocks b ON b.driver_id=u.id
WHERE p.status='DRAFT' AND c.status IN ('READY','PROCESSING') ORDER BY p.updated_at,p.id LIMIT 3`;

export const selectDefaultPayoutMethod = `SELECT * FROM driver_payout_methods WHERE driver_id=$1 AND is_default
AND ((status='VERIFIED' AND provider_fund_account_id IS NOT NULL)
  OR (status='PENDING' AND pending_details IS NOT NULL)) LIMIT 1`;

export const deferDraftTransfer =
  'UPDATE driver_payouts SET updated_at=clock_timestamp() WHERE id=$1';

export const sumCreditedEarnings = `SELECT COALESCE(sum(l.amount_paise),0)::text AS earnings FROM driver_payout_lines l
JOIN wallet_entries e ON e.id=l.source_entry_id WHERE l.payout_id=$1 AND e.kind <> 'CASH_PAYMENT'`;

export const holdPayoutBalance = `UPDATE wallets SET available_paise=available_paise-$2,held_paise=held_paise+$3
WHERE id=$1 AND available_paise >= $2 RETURNING available_paise,held_paise`;

export const setReadyPayout = `UPDATE driver_payouts SET status='READY',method_id=$2,destination_snapshot=$3::jsonb,updated_at=clock_timestamp() WHERE id=$1`;

export const insertPayoutAttempt = `INSERT INTO driver_payout_attempts(id,payout_id,attempt_number,idempotency_key,next_retry_at,updated_at)
VALUES ($1,$2,1,$3,clock_timestamp(),clock_timestamp())`;

export const selectUnconfirmedAttempt = `SELECT id,idempotency_key FROM driver_payout_attempts WHERE payout_id=$1
AND status='REVIEW_REQUIRED' AND failure_code='SUBMISSION_UNCONFIRMED' ORDER BY attempt_number DESC LIMIT 1`;

export const markSubmissionUnconfirmed = `UPDATE driver_payout_attempts SET status='REVIEW_REQUIRED',failure_code='SUBMISSION_UNCONFIRMED',
updated_at=clock_timestamp() WHERE id=$1`;

export const checkPayoutDriver = `SELECT (u.status='ACTIVE' AND u.deleted_at IS NULL
AND (b.driver_id IS NULL OR b.expires_at <= statement_timestamp())) AS eligible
FROM wallets w JOIN users u ON u.id=w.user_id
LEFT JOIN payout_driver_blocks b ON b.driver_id=u.id WHERE w.id=$1`;

export const deferPayoutAttempt =
  'UPDATE driver_payout_attempts SET next_retry_at=$2,updated_at=clock_timestamp() WHERE id=$1';

export const claimPayoutSubmission = `UPDATE driver_payout_attempts SET next_retry_at=$2,status='PROCESSING',
first_submitted_at=COALESCE(first_submitted_at,clock_timestamp()),updated_at=clock_timestamp() WHERE id=$1`;

export const finishWalletHold = `UPDATE wallets SET held_paise=held_paise-$2,available_paise=available_paise+$3
WHERE id=$1 AND held_paise >= $2 RETURNING available_paise,held_paise`;

export const recordProviderPayout = `UPDATE driver_payout_attempts SET status=$2::"PayoutStatus",provider_payout_id=$3,
utr=CASE WHEN $4 THEN $5 ELSE utr END,failure_code=$6,next_retry_at=$7,updated_at=clock_timestamp() WHERE id=$1`;

export const readPayoutAttempt = `SELECT a.*,p.cycle_id,p.wallet_id,p.amount_paise,p.destination_snapshot
FROM driver_payout_attempts a JOIN driver_payouts p ON p.id=a.payout_id WHERE a.id=$1`;

export const changePayoutStatus = `UPDATE driver_payouts SET status=$2::"PayoutStatus",exclusion_reason=CASE WHEN $3 THEN $4 ELSE exclusion_reason END,
updated_at=clock_timestamp() WHERE id=$1`;

export const insertPayoutLedgerEntry = `INSERT INTO wallet_entries(id,wallet_id,payout_id,kind,operation_key,available_delta_paise,held_delta_paise,available_after_paise,held_after_paise)
VALUES ($1,$2,$3,$4::"WalletEntryKind",$5,$6,$7,$8,$9)`;

export const listTransferStatuses =
  "SELECT DISTINCT status FROM driver_payouts WHERE cycle_id=$1 AND status <> 'EXCLUDED'";

export const updateCycleStatus =
  'UPDATE payout_cycles SET status=$2::"PayoutStatus",version=version+1 WHERE id=$1';
