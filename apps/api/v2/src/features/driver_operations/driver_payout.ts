import type { TransactionClient } from '../../infra/database/client.js';
import {
  input_kind,
  upi_pattern,
} from '../partner_program/partner_field.rules.js';
import type { Prisma } from '@prisma/client';

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
  const apps = await tx.partnerApplication.findMany({
    where: { user_id: { in: user_ids } },
    select: { user_id: true, fields: approved_fields },
  });
  const result = new Map<string, string>();
  for (const app of apps) {
    const upi = unique_upi(app.fields);
    if (upi) result.set(app.user_id, upi);
  }
  return result;
}
