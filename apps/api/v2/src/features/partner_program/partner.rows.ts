// PostgreSQL query row and persisted status types.
import type { JsonValue } from '../../database/json-value.js';

type PartnerReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type PartnerApplicationStatus =
  | 'SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'CONFIRMATION_SUBMITTED'
  | 'CONFIRMATION_CHANGES_REQUESTED'
  | 'COMPLETED'
  | 'ACTIVATED'
  | 'EXITED';

export type PartnerApplication = {
  id: string;
  user_id: string;
  current_user_id: string | null;
  status: PartnerApplicationStatus;
  version: number;
  contact_email: string;
  whatsapp_phone: string;
  policy_snapshot: JsonValue;
  confirmation_document: JsonValue | null;
  submitted_at: Date;
  reviewed_at: Date | null;
  reviewed_by_id: string | null;
  completed_at: Date | null;
  activated_at: Date | null;
  final_pdf_id: string | null;
  activation_hash: string | null;
  activation_salt: string | null;
  activation_ciphertext: string | null;
  activation_attempts: number;
  activation_issued_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PartnerApplicationField = {
  id: string;
  application_id: string;
  requirement_id: string;
  definition: JsonValue;
  value: JsonValue;
  status: PartnerReviewStatus;
  rejection_reason: string | null;
  reviewed_by_id: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PartnerAsset = {
  id: string;
  owner_id: string;
  application_id: string | null;
  purpose: string;
  field_id: string | null;
  file_name: string;
  mime_type: string;
  size: number;
  sha256: string;
  content: Buffer;
  created_at: Date;
  updated_at: Date;
};

export type PartnerConfirmation = {
  id: string;
  application_id: string;
  document_snapshot: JsonValue;
  signature_name: string;
  accepted_at: Date;
  status: PartnerReviewStatus;
  rejection_reason: string | null;
  reviewed_by_id: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PartnerDocument = {
  id: string;
  kind: string;
  title: string;
  html: string;
  revision: number;
  published_title: string | null;
  published_html: string | null;
  published_version: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
