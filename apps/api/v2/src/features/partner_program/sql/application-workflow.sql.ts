import type {
  PartnerApplication,
  PartnerApplicationField,
  PartnerAsset,
  PartnerConfirmation,
  PartnerDocument,
} from '../partner.rows.js';
import type { SqlClient } from '../../../database/postgres.service.js';

export type AssetMetadata = Pick<
  PartnerAsset,
  | 'id'
  | 'owner_id'
  | 'purpose'
  | 'field_id'
  | 'file_name'
  | 'mime_type'
  | 'size'
  | 'created_at'
>;
export const assetMetadata =
  'id,owner_id,purpose,field_id,file_name,mime_type,size,created_at';

type Application = PartnerApplication & {
  fields: PartnerApplicationField[];
  confirmation: PartnerConfirmation | null;
};

export async function readApplication(
  tx: SqlClient,
  id: string,
  byOwner = false,
) {
  const {
    rows: [application],
  } = await tx.query<Application>(
    `SELECT a.*, COALESCE((
        SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id)
        FROM partner_application_fields f WHERE f.application_id=a.id
      ),'[]'::jsonb) AS fields,
      (SELECT to_jsonb(c) FROM partner_confirmations c WHERE c.application_id=a.id) AS confirmation
      FROM partner_applications a WHERE ${byOwner ? 'a.current_user_id' : 'a.id'}=$1`,
    [id],
  );
  if (application?.confirmation) {
    application.confirmation.accepted_at = new Date(
      application.confirmation.accepted_at,
    );
  }
  return application ?? null;
}

export async function readExitedApplication(tx: SqlClient, userId: string) {
  const {
    rows: [latest],
  } = await tx.query<{ id: string }>(
    "SELECT id FROM partner_applications WHERE user_id=$1 AND status='EXITED' ORDER BY created_at DESC,id DESC LIMIT 1",
    [userId],
  );
  return latest ? readApplication(tx, latest.id) : null;
}

export async function readPartnerDocument(
  tx: SqlClient,
  kind: 'POLICY' | 'CONFIRMATION',
) {
  const {
    rows: [doc],
  } = await tx.query<PartnerDocument>(
    'SELECT * FROM partner_documents WHERE kind=$1',
    [kind],
  );
  return doc ?? null;
}

type Requirement = {
  id: string;
  key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  category: { name: string; sort_order: number };
  sort_order: number;
  min_value: number | null;
  max_value: number | null;
  max_length: number | null;
  allow_multiple: boolean;
  max_file_size_mb: number | null;
  allowed_extensions: string[];
};
export async function readActiveRequirements(tx: SqlClient, id?: string) {
  const { rows } = await tx.query<Requirement>(
    `SELECT r.*,to_jsonb(c) AS category FROM partner_requirements r
      JOIN requirement_categories c ON c.id=r.category_id
      WHERE r.is_active AND c.is_active AND ($1::text IS NULL OR r.id=$1)
      ORDER BY c.sort_order,r.sort_order,r.id`,
    [id],
  );
  return rows;
}

export async function readAnswerAssets(
  tx: SqlClient,
  userId: string,
  applicationId: string | null,
  ids: string[],
  fieldId?: string,
  purpose?: string,
) {
  const { rows } = await tx.query<AssetMetadata>(
    `SELECT ${assetMetadata} FROM partner_assets WHERE owner_id=$1 AND application_id IS NOT DISTINCT FROM $2
      AND id=ANY($3::text[]) AND ($4::text IS NULL OR field_id=$4) AND ($5::text IS NULL OR purpose=$5)`,
    [userId, applicationId, ids, fieldId, purpose],
  );
  return rows;
}
