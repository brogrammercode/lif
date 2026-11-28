// Keep the predicates shared by counts and drill-down lists.
export const pending_application_sql = `(a.status = 'SUBMITTED' OR
  (a.status = 'CHANGES_REQUESTED' AND EXISTS(SELECT 1 FROM partner_application_fields f
    WHERE f.application_id=a.id AND f.status='PENDING'
      AND f.value IS NOT NULL AND f.value NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb))) OR
  (a.status IN ('CHANGES_REQUESTED','APPROVED') AND EXISTS(SELECT 1 FROM notifications n
    WHERE n.channel='EMAIL' AND n.sent_at IS NULL AND n.data->>'application_id'=a.id
    AND (n.data->>'expected_status' IS NULL OR n.data->>'expected_status'=a.status::text)
    AND (n.data->>'state'='FAILED' OR n.updated_at < NOW()-INTERVAL '5 minutes'))))`;
export const pending_vehicle_sql = `(v.status='UNDER_REVIEW' OR (v.status='REJECTED' AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.verification_fields)='array' THEN v.verification_fields ELSE '[]'::jsonb END) f
  WHERE f->>'status'='PENDING')))`;
export const pending_confirmation_sql = `(a.status='CONFIRMATION_SUBMITTED' OR
 (a.status='COMPLETED' AND a.activation_attempts >= 5) OR EXISTS(
 SELECT 1 FROM partner_deliveries d WHERE d.application_id=a.id AND
 ((d.channel='EMAIL' AND a.status IN ('COMPLETED','ACTIVATED')) OR (d.channel='ACTIVATION_EMAIL' AND a.status='COMPLETED'))
 AND (d.status='FAILED' OR (d.status IN ('PENDING','SENDING') AND d.updated_at < NOW()-INTERVAL '5 minutes')))
 OR (a.status IN ('CONFIRMATION_SUBMITTED','CONFIRMATION_CHANGES_REQUESTED','COMPLETED') AND EXISTS(
 SELECT 1 FROM notifications n WHERE n.channel='EMAIL' AND n.sent_at IS NULL AND n.data->>'application_id'=a.id
    AND (n.data->>'expected_status' IS NULL OR n.data->>'expected_status'=a.status::text)
 AND (n.data->>'state'='FAILED' OR n.updated_at < NOW()-INTERVAL '5 minutes'))))`;

export const pending_exit_sql = `(e.status IN ('REQUESTED','REVIEWING') OR
 (e.status='COMPLETED' AND EXISTS(SELECT 1 FROM partner_deliveries d WHERE d.application_id=e.application_id AND d.channel='EXIT_EMAIL'
 AND (d.status='FAILED' OR (d.status IN ('PENDING','SENDING') AND d.updated_at<NOW()-INTERVAL '5 minutes')))))`;
