import type {
  FarePolicy,
  SupportContacts,
  TripReviewPage,
} from "./configuration.api";
import { fareGroups } from "./configuration.api";

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const textOrNull = (v: unknown) => v === null || typeof v === "string";
const integer = (v: unknown, min = 0) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const dateOrNull = (v: unknown) =>
  v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)));
function requireShape(condition: unknown): asserts condition {
  if (!condition)
    throw new Error(
      "The server returned incomplete configuration data. Reload to try again.",
    );
}
function metadata(v: unknown): asserts v is Record<string, unknown> {
  requireShape(
    record(v) &&
      integer(v.version) &&
      dateOrNull(v.updated_at) &&
      (v.updated_by === null ||
        (record(v.updated_by) &&
          typeof v.updated_by.id === "string" &&
          textOrNull(v.updated_by.first_name) &&
          textOrNull(v.updated_by.last_name))),
  );
}
export function decodeFarePolicy(v: unknown): FarePolicy {
  metadata(v);
  requireShape(
    typeof v.cash_enabled === "boolean" &&
      typeof v.direct_upi_enabled === "boolean" &&
      (v.cash_enabled || v.direct_upi_enabled) &&
      v.online_payment_enabled === false &&
      v.commission_percent === 0 &&
      integer(v.free_cancellation_minutes) &&
      integer(v.free_pickup_wait_minutes) &&
      number(v.cancellation_fee_percent) &&
      number(v.maximum_cancellation_fee) &&
      Array.isArray(v.rates),
  );
  const groups = fareGroups.map((g) => g.key as string);
  requireShape(
    (v.version === 0 && v.rates.length === 0) ||
      (v.rates.length === 3 &&
        v.rates.every(
          (r) =>
            record(r) &&
            groups.includes(String(r.group)) &&
            number(r.max_profit_km) &&
            number(r.normal_fare_per_km) &&
            number(r.profit_fare_per_km),
        ) &&
        new Set(v.rates.map((r) => r.group)).size === 3),
  );
  for (const key of [
    "arrival_radius_m",
    "location_max_age_s",
    "matching_initial_radius_km",
    "matching_max_radius_km",
    "matching_expansion_s",
    "search_timeout_s",
    "offer_lifetime_s",
  ]) {
    requireShape(v[key] === undefined || integer(v[key], 1));
  }
  return v as unknown as FarePolicy;
}
export function decodeSupportContacts(v: unknown): SupportContacts {
  metadata(v);
  requireShape(
    [
      "support_phone",
      "emergency_phone",
      "whatsapp_phone",
      "support_email",
      "support_hours",
      "instructions",
    ].every((k) => textOrNull(v[k])),
  );
  return v as unknown as SupportContacts;
}
export function decodeTripReviews(v: unknown): TripReviewPage {
  requireShape(
    record(v) &&
      Array.isArray(v.items) &&
      integer(v.total) &&
      integer(v.page, 1) &&
      integer(v.page_size, 1),
  );
  requireShape(
    v.items.every(
      (row) =>
        record(row) &&
        typeof row.id === "string" &&
        typeof row.ride_id === "string" &&
        typeof row.reported_by_id === "string" &&
        textOrNull(row.driver_id) &&
        ["CANCELLATION", "NO_SHOW", "UNPAID"].includes(String(row.kind)) &&
        [
          "REQUESTED",
          "DISPUTED",
          "APPROVED",
          "WAIVED",
          "REJECTED",
          "SETTLED",
        ].includes(String(row.status)) &&
        typeof row.reason === "string" &&
        typeof row.fee_amount === "string" &&
        row.fee_amount.trim() !== "" &&
        number(Number(row.fee_amount)) &&
        integer(row.version, 1) &&
        textOrNull(row.dispute_reason) &&
        textOrNull(row.resolution_note) &&
        record(row.ride) &&
        typeof row.ride.rider_id === "string" &&
        typeof row.ride.pickup_address === "string" &&
        typeof row.ride.dropoff_address === "string" &&
        dateOrNull(row.ride.matched_at) &&
        dateOrNull(row.ride.arrived_at) &&
        Array.isArray(row.ride.events) &&
        row.ride.events.every(
          (event) =>
            record(event) &&
            typeof event.id === "string" &&
            typeof event.event_type === "string" &&
            typeof event.created_at === "string" &&
            dateOrNull(event.created_at),
        ),
    ),
  );
  return v as unknown as TripReviewPage;
}
