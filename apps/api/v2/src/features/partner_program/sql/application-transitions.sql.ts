import { assetMetadata } from './application-workflow.sql.js';

export const changeApplicationStatus = `UPDATE partner_applications SET status=$2::"PartnerApplicationStatus",version=version+1,
updated_at=clock_timestamp() WHERE id=$1 RETURNING status,version`;

export const insertApplicationNotice = `INSERT INTO notifications(id,user_id,type,channel,title,body,data,updated_at)
VALUES($1,$2,'ACCOUNT','IN_APP',$3,$4,$5::jsonb,clock_timestamp())`;

export const listWorkflowAssets = `SELECT ${assetMetadata} FROM partner_assets WHERE owner_id=$1 AND application_id IS NOT DISTINCT FROM $2
AND purpose IN ('APPLICATION_DOCUMENT','APPLICATION_SELFIE','FINAL_PDF')
ORDER BY created_at DESC,id DESC`;

export const detachFormerApplication =
  'UPDATE partner_applications SET current_user_id=NULL,updated_at=clock_timestamp() WHERE id=$1';

export const resubmitApplication = `UPDATE partner_applications SET status='SUBMITTED',contact_email=$2,whatsapp_phone=$3,version=version+1,
submitted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1
RETURNING id,user_id,contact_email,version,status`;

export const insertApplication = `INSERT INTO partner_applications(id,user_id,current_user_id,contact_email,whatsapp_phone,policy_snapshot,updated_at)
VALUES ($1,$2,$2,$3,$4,$5::jsonb,clock_timestamp()) RETURNING id,user_id,contact_email,version,status`;

export const attachApplicationAssets = `UPDATE partner_assets SET application_id=$2,updated_at=clock_timestamp() WHERE owner_id=$1
AND application_id IS NULL AND purpose IN ('APPLICATION_DOCUMENT','APPLICATION_SELFIE')`;

export const insertApplicationFields = `INSERT INTO partner_application_fields(id,application_id,requirement_id,definition,value,updated_at)
SELECT f.id,$1,f.requirement_id,f.definition,COALESCE(f.value,'null'::jsonb),clock_timestamp()
FROM jsonb_to_recordset($2::jsonb) f(id text,requirement_id text,definition jsonb,value jsonb)`;

export const replaceApplicationAnswer = `INSERT INTO partner_application_fields(id,application_id,requirement_id,definition,value,updated_at)
VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,clock_timestamp())
ON CONFLICT (application_id,requirement_id) DO UPDATE SET value=excluded.value,status='PENDING',
  rejection_reason=NULL,reviewed_at=NULL,reviewed_by_id=NULL,updated_at=clock_timestamp()`;

export const reviewApplicationAnswer = `UPDATE partner_application_fields SET status=$2::"PartnerReviewStatus",rejection_reason=$3,
reviewed_at=clock_timestamp(),reviewed_by_id=$4,updated_at=clock_timestamp() WHERE id=$1`;

export const requestApplicationSelfie = `INSERT INTO partner_application_fields(id,application_id,requirement_id,definition,value,status,rejection_reason,reviewed_by_id,reviewed_at,updated_at)
VALUES ($1,$2,$3,$4::jsonb,'null'::jsonb,'REJECTED',$5,$6,clock_timestamp(),clock_timestamp())`;

export const approveApplication = `UPDATE partner_applications SET status='APPROVED',confirmation_document=$2::jsonb,
reviewed_by_id=$3,reviewed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
WHERE id=$1 RETURNING status,version`;

export const saveConfirmation = `INSERT INTO partner_confirmations(id,application_id,document_snapshot,signature_name,updated_at)
VALUES ($1,$2,$3::jsonb,$4,clock_timestamp())
ON CONFLICT(application_id) DO UPDATE SET document_snapshot=excluded.document_snapshot,
  signature_name=excluded.signature_name,accepted_at=clock_timestamp(),status='PENDING',rejection_reason=NULL,
  reviewed_at=NULL,reviewed_by_id=NULL,updated_at=clock_timestamp()`;

export const findFinalAgreementPdf = `SELECT id FROM partner_assets WHERE id=$1 AND owner_id=$2 AND application_id=$3
AND purpose='FINAL_PDF' AND mime_type='application/pdf'`;

export const reviewConfirmation = `UPDATE partner_confirmations SET status=$2::"PartnerReviewStatus",rejection_reason=$3,
reviewed_by_id=$4,reviewed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`;

export const finishConfirmation = `UPDATE partner_applications SET status=$2::"PartnerApplicationStatus",
final_pdf_id=CASE WHEN $3 THEN $4 ELSE final_pdf_id END,
completed_at=CASE WHEN $3 THEN clock_timestamp() ELSE completed_at END,
version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING status,version`;

export const initiateAgreementDeliveries = `INSERT INTO partner_deliveries(id,application_id,channel,status,updated_at)
VALUES ($1,$3,'EMAIL','PENDING',clock_timestamp()),($2,$3,'WHATSAPP','MANUAL_PENDING',clock_timestamp())
ON CONFLICT(application_id,channel) DO NOTHING`;

export const findDuplicatePartnerAsset = `SELECT ${assetMetadata} FROM partner_assets WHERE owner_id=$1 AND application_id IS NOT DISTINCT FROM $2
AND purpose=$3 AND field_id IS NOT DISTINCT FROM $4 AND sha256=$5 AND file_name=$6 LIMIT 1`;

export const readPartnerAssetUsage =
  'SELECT COALESCE(sum(size),0)::text AS size,count(*)::int AS count FROM partner_assets WHERE owner_id=$1';

export const insertPartnerAsset = `INSERT INTO partner_assets(id,owner_id,application_id,purpose,field_id,file_name,mime_type,size,sha256,content,updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()) RETURNING ${assetMetadata}`;

export const readAuthorizedPartnerAsset = `SELECT a.id,a.owner_id,a.purpose,a.field_id,a.file_name,a.mime_type,a.size,a.created_at,a.content
FROM partner_assets a JOIN users u ON u.id=$1 WHERE a.id=$2 AND u.status='ACTIVE' AND u.deleted_at IS NULL
AND (u.role='ADMIN' OR (a.owner_id=u.id AND CASE a.purpose
  WHEN 'FINAL_PDF' THEN EXISTS(SELECT 1 FROM partner_applications p
    WHERE p.user_id=u.id AND p.final_pdf_id=a.id AND p.status IN ('COMPLETED','ACTIVATED','EXITED'))
  WHEN 'EXIT_PDF' THEN EXISTS(SELECT 1 FROM partner_exit_requests e
    JOIN partner_applications p ON p.id=e.application_id WHERE p.user_id=u.id
      AND e.settlement_pdf_id=a.id AND e.status='COMPLETED')
  ELSE true END))`;

export const recordActivationShare = `INSERT INTO partner_deliveries(id,application_id,channel,status,sent_at,attempts,updated_at)
VALUES($1,$2,'ACTIVATION_WHATSAPP','MANUALLY_SHARED',clock_timestamp(),1,clock_timestamp())
ON CONFLICT(application_id,channel) DO UPDATE SET status='MANUALLY_SHARED',sent_at=excluded.sent_at,
  attempts=partner_deliveries.attempts+1,updated_at=excluded.updated_at`;

export const queueActivationEmail = `INSERT INTO partner_deliveries(id,application_id,channel,updated_at)
VALUES($1,$2,'ACTIVATION_EMAIL',clock_timestamp())
ON CONFLICT(application_id,channel) DO UPDATE SET status='PENDING',last_error=NULL,claimed_at=NULL,
  sent_at=NULL,provider_id=NULL,updated_at=excluded.updated_at
WHERE partner_deliveries.status IN ('PENDING','FAILED','SENT')
  OR (partner_deliveries.status='SENDING' AND COALESCE(partner_deliveries.claimed_at,partner_deliveries.updated_at)
    < statement_timestamp()-interval '5 minutes')`;

export const resetActivationAttempts =
  'UPDATE partner_applications SET activation_attempts=0,updated_at=clock_timestamp() WHERE id=$1';

export const increaseActivationAttempts =
  'UPDATE partner_applications SET activation_attempts=activation_attempts+1,updated_at=clock_timestamp() WHERE id=$1';

export const lockDriverActivation =
  'SELECT pg_advisory_xact_lock(720043,hashtext($1))';

export const assignDriverRole = `UPDATE users SET role=CASE WHEN role='RIDER' THEN 'DRIVER'::"UserRole" ELSE role END,
partner_activated_at=clock_timestamp(),updated_at=clock_timestamp()
WHERE id=$1 AND role=$2::"UserRole" AND status='ACTIVE' AND deleted_at IS NULL`;

export const verifyDriverProfile = `INSERT INTO driver_profiles(id,user_id,verification_status,verified_at,updated_at)
VALUES($1,$2,'VERIFIED',clock_timestamp(),clock_timestamp())
ON CONFLICT(user_id) DO UPDATE SET verification_status='VERIFIED',verified_at=excluded.verified_at,updated_at=excluded.updated_at`;

export const reinstateReturningDriver = `UPDATE driver_profiles SET availability='OFFLINE',updated_at=clock_timestamp()
WHERE user_id=$1 AND availability='SUSPENDED' AND EXISTS (SELECT 1 FROM partner_applications
  WHERE user_id=$1 AND status='EXITED')`;

export const activateApplication = `UPDATE partner_applications SET status='ACTIVATED',activated_at=clock_timestamp(),activation_hash=NULL,
activation_salt=NULL,activation_ciphertext=NULL,version=version+1,updated_at=clock_timestamp() WHERE id=$1`;

export const findNotificationApplication =
  'SELECT id FROM partner_applications WHERE id=$1';

export const retryPartnerNotifications = `WITH candidates AS (
  SELECT id FROM notifications WHERE channel='EMAIL' AND type='SYSTEM' AND title=$2
    AND sent_at IS NULL AND data->>'kind'='PARTNER_LIFECYCLE_EMAIL' AND data->>'application_id'=$1
    AND (data->>'state' IN ('FAILED','PENDING') OR updated_at<statement_timestamp()-interval '5 minutes')
  ORDER BY updated_at,id LIMIT 50 FOR UPDATE SKIP LOCKED
)
UPDATE notifications n SET data=n.data||'{"state":"PENDING","last_error":null}'::jsonb,updated_at=clock_timestamp()
 FROM candidates c WHERE n.id=c.id`;

export const findAgreementForDelivery =
  'SELECT status,final_pdf_id FROM partner_applications WHERE id=$1';

export const recordAgreementShare = `UPDATE partner_deliveries SET status='MANUALLY_SHARED',sent_at=clock_timestamp(),
attempts=attempts+1,updated_at=clock_timestamp() WHERE application_id=$1 AND channel='WHATSAPP'`;
