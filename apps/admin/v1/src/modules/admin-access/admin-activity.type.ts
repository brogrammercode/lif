import type { AccessIdentity } from "./admin-access.type";

export type Activity = {
  id: string;
  request_id: string;
  actor: AccessIdentity | null;
  method: string;
  path: string;
  action: string;
  resource?: string;
  status_code: number | null;
  started_at: string;
  completed_at: string | null;
  ip_address: string | null;
};
export type ActivityPage = {
  activities: Activity[];
  total: number;
  page: number;
  page_size: number;
  retention_days?: number | null;
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const nullableText = (value: unknown) =>
  value === null || typeof value === "string";
const date = (value: unknown) =>
  text(value) && Number.isFinite(Date.parse(value));
export function readActivityPage(value: unknown): ActivityPage {
  const fail = () => {
    throw new Error(
      "Activity data could not be verified. Refresh to try again.",
    );
  };
  if (
    !record(value) ||
    !Array.isArray(value.activities) ||
    !Number.isSafeInteger(value.total) ||
    Number(value.total) < 0 ||
    !Number.isSafeInteger(value.page) ||
    Number(value.page) < 1 ||
    !Number.isSafeInteger(value.page_size) ||
    Number(value.page_size) < 1 ||
    Number(value.page_size) > 100 ||
    (value.retention_days != null && value.retention_days !== 7)
  )
    return fail();
  if (
    value.activities.length > Number(value.page_size) ||
    value.activities.length > Number(value.total) ||
    Number(value.page) >
      Math.max(1, Math.ceil(Number(value.total) / Number(value.page_size)))
  )
    return fail();
  const ids = new Set<string>();
  for (const row of value.activities) {
    if (
      !record(row) ||
      !text(row.id) ||
      ids.has(row.id) ||
      !text(row.request_id) ||
      !text(row.action) ||
      !text(row.method) ||
      !text(row.path) ||
      !date(row.started_at) ||
      (row.completed_at !== null && !date(row.completed_at)) ||
      !nullableText(row.ip_address) ||
      (row.resource !== undefined && !text(row.resource)) ||
      (row.status_code !== null &&
        (!Number.isInteger(row.status_code) ||
          Number(row.status_code) < 100 ||
          Number(row.status_code) > 599))
    )
      return fail();
    if (
      row.actor !== null &&
      (!record(row.actor) ||
        !text(row.actor.id) ||
        ![
          row.actor.first_name,
          row.actor.last_name,
          row.actor.email,
          row.actor.avatar_url,
        ].every(nullableText))
    )
      return fail();
    ids.add(row.id);
  }
  return value as ActivityPage;
}
