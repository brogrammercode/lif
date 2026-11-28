import type { SqlClient } from '../../database/postgres.service.js';
import {
  input_kind,
  upi_pattern,
} from '../partner_program/partner_field.rules.js';
import type { JsonValue } from '../../database/json-value.js';
import { reveal_payout } from '../driver_account/payout_security.js';
/** An unreadable current destination must not revive a retired application UPI. */
function current_upi(ciphertext: string) {
  try {
    return reveal_payout(ciphertext).upi ?? null;
  } catch {
    return null;
  }
}

function unique_upi(fields: { value: JsonValue; definition: JsonValue }[]) {
  const handles = new Set(
    fields.flatMap((field) => {
      const definition = field.definition;
      if (
        !definition ||
        typeof definition !== 'object' ||
        Array.isArray(definition) ||
        typeof definition.label !== 'string' ||
        typeof definition.field_type !== 'string'
      )
        return [];
      if (
        input_kind({
          key: typeof definition.key === 'string' ? definition.key : undefined,
          label: definition.label,
          field_type: definition.field_type,
        }) !== 'UPI'
      )
        return [];
      return typeof field.value === 'string' &&
        upi_pattern.test(field.value.trim())
        ? [field.value.trim()]
        : [];
    }),
  );
  return handles.size === 1 ? [...handles][0]! : null;
}

export async function findApprovedDriverUpi(tx: SqlClient, userId: string) {
  const {
    rows: [change],
  } = await tx.query<{ details_ciphertext: string }>(
    `SELECT details_ciphertext FROM driver_payout_changes WHERE user_id=$1 AND status='APPROVED'
      ORDER BY reviewed_at DESC,id DESC LIMIT 1`,
    [userId],
  );
  if (change) return current_upi(change.details_ciphertext);
  const { rows } = await tx.query<{
    value: JsonValue;
    definition: JsonValue;
  }>(
    `SELECT f.value,f.definition FROM partner_application_fields f
      JOIN partner_applications a ON a.id=f.application_id
      WHERE a.current_user_id=$1 AND f.status='APPROVED'`,
    [userId],
  );
  return unique_upi(rows);
}

export async function findApprovedDriverUpis(
  tx: SqlClient,
  userIds: readonly string[],
) {
  const result = new Map<string, string>();
  if (!userIds.length) return result;
  const { rows: changes } = await tx.query<{
    user_id: string;
    details_ciphertext: string;
  }>(
    `SELECT DISTINCT ON (user_id) user_id,details_ciphertext FROM driver_payout_changes
      WHERE user_id=ANY($1::text[]) AND status='APPROVED' ORDER BY user_id,reviewed_at DESC,id DESC`,
    [userIds],
  );
  const currentDestinations = new Set<string>();
  for (const { user_id, details_ciphertext } of changes) {
    currentDestinations.add(user_id);
    const upi = current_upi(details_ciphertext);
    if (upi) result.set(user_id, upi);
  }
  const legacyUsers = userIds.filter((id) => !currentDestinations.has(id));
  if (!legacyUsers.length) return result;
  const { rows: fields } = await tx.query<{
    user_id: string;
    value: JsonValue;
    definition: JsonValue;
  }>(
    `SELECT a.current_user_id AS user_id,f.value,f.definition FROM partner_application_fields f
      JOIN partner_applications a ON a.id=f.application_id
      WHERE a.current_user_id=ANY($1::text[]) AND f.status='APPROVED'`,
    [legacyUsers],
  );
  const byUser = new Map<string, typeof fields>();
  for (const field of fields) {
    const userFields = byUser.get(field.user_id) ?? [];
    userFields.push(field);
    byUser.set(field.user_id, userFields);
  }
  for (const [id, userFields] of byUser) {
    const upi = unique_upi(userFields);
    if (upi) result.set(id, upi);
  }
  return result;
}
