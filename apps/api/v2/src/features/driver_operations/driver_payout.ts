import type { TransactionClient } from '../../infra/database/client.js';
import {
  input_kind,
  upi_pattern,
} from '../partner_program/partner_field.rules.js';
import type { Prisma } from '@prisma/client';
import { reveal_payout } from '../driver_account/payout_security.js';
/** An unreadable current destination must not revive a retired application UPI. */
function current_upi(ciphertext: string) {
  try {
    return reveal_payout(ciphertext).upi ?? null;
  } catch {
    return null;
  }
}

const approved_fields = {
  where: { status: 'APPROVED' as const },
  select: { value: true, definition: true },
};

function unique_upi(
  fields: { value: Prisma.JsonValue; definition: Prisma.JsonValue }[],
) {
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
export async function approved_driver_upi(
  tx: TransactionClient,
  user_id: string,
) {
  const change = await tx.driverPayoutChange.findFirst({
    where: { user_id, status: 'APPROVED' },
    orderBy: [{ reviewed_at: 'desc' }, { id: 'desc' }],
    select: { details_ciphertext: true },
  });
  if (change) return current_upi(change.details_ciphertext);
  const app = await tx.partnerApplication.findUnique({
    where: { user_id },
    select: {
      fields: approved_fields,
    },
  });
  return unique_upi(app?.fields ?? []);
}

/** Matching checks a bounded candidate pool in one database round trip. */
export async function approved_driver_upis(
  tx: TransactionClient,
  user_ids: string[],
) {
  if (!user_ids.length) return new Map<string, string>();
  const changes = await tx.driverPayoutChange.findMany({
    where: { user_id: { in: user_ids }, status: 'APPROVED' },
    orderBy: [{ reviewed_at: 'desc' }, { id: 'desc' }],
    select: { user_id: true, details_ciphertext: true },
  });
  const apps = await tx.partnerApplication.findMany({
    where: { user_id: { in: user_ids } },
    select: { user_id: true, fields: approved_fields },
  });
  const result = new Map<string, string>();
  for (const app of apps) {
    const upi = unique_upi(app.fields);
    if (upi) result.set(app.user_id, upi);
  }
  const seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.user_id)) continue;
    seen.add(change.user_id);
    result.delete(change.user_id);
    const upi = current_upi(change.details_ciphertext);
    if (upi) result.set(change.user_id, upi);
  }
  return result;
}
