import type {
  FarePolicy,
  SupportContacts,
  TripReviewPage,
} from "./configuration.api";
import {
  isCategoryFare,
  isCategoryRevision,
} from "../vehicle-categories/category-fare";

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
  requireShape(
    v.rates.every(
      (r) =>
        record(r) &&
        typeof r.category_id === "string" &&
        r.category_id.length > 0 &&
        typeof r.name === "string" &&
        textOrNull(r.parent_name) &&
        ["BIKE", "SCOOTER", "AUTO", "SEDAN", "SUV"].includes(
          String(r.vehicle_type),
        ) &&
        typeof r.is_active === "boolean" &&
        typeof r.is_selectable === "boolean" &&
        isCategoryRevision(r.updated_at) &&
        (r.fare_policy === null || isCategoryFare(r.fare_policy)),
    ) && new Set(v.rates.map((r) => r.category_id)).size === v.rates.length,
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
