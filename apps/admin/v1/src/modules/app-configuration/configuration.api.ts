import type { RidePerson } from "../users/ride-presentation";
import { apiRequest } from "../../lib/api-client";
import type { CategoryFare, VehicleFamily } from "../../types/domain";
export type FareRate = {
  category_id: string;
  name: string;
  parent_name: string | null;
  vehicle_type: VehicleFamily;
  is_active: boolean;
  is_selectable: boolean;
  updated_at: string;
  fare_policy: CategoryFare | null;
};
export type ConfigurationMetadata = {
  version: number;
  updated_at: string | null;
  updated_by: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};
export type PaymentPolicy = {
  arrival_radius_m: number;
  location_max_age_s: number;
  matching_initial_radius_km: number;
  matching_max_radius_km: number;
  matching_expansion_s: number;
  search_timeout_s: number;
  offer_lifetime_s: number;
  cash_enabled: boolean;
  direct_upi_enabled: boolean;
  online_payment_enabled: false;
  commission_percent: 0;
  free_cancellation_minutes: number;
  free_pickup_wait_minutes: number;
  cancellation_fee_percent: number;
  maximum_cancellation_fee: number;
};
export type FarePolicy = ConfigurationMetadata &
  PaymentPolicy & { rates: FareRate[] };
export type SupportContacts = ConfigurationMetadata & {
  support_phone: string | null;
  emergency_phone: string | null;
  whatsapp_phone: string | null;
  support_email: string | null;
  support_hours: string | null;
  instructions: string | null;
};
export const saveFarePolicy = (value: FarePolicy, signal: AbortSignal) => {
  const { version, updated_at: _, updated_by: __, rates, ...settings } = value;
  return apiRequest<FarePolicy>("/admin/fare-policy", {
    method: "PATCH",
    signal,
    data: {
      expected_version: version,
      ...settings,
      rates: rates.map((rate) => ({
        category_id: rate.category_id,
        expected_updated_at: rate.updated_at,
        fare_policy: rate.fare_policy,
      })),
    },
  });
};
export const saveSupportContacts = (
  value: SupportContacts,
  signal: AbortSignal,
) =>
  apiRequest<SupportContacts>("/admin/support/configuration/contact", {
    method: "PATCH",
    signal,
    data: {
      expected_version: value.version,
      support_phone: value.support_phone,
      emergency_phone: value.emergency_phone,
      whatsapp_phone: value.whatsapp_phone,
      support_email: value.support_email,
      support_hours: value.support_hours,
      instructions: value.instructions,
    },
  });

export type TripReview = {
  id: string;
  ride_id: string;
  reported_by_id: string;
  reported_by?: RidePerson | null;
  driver_id: string | null;
  kind: string;
  status: string;
  reason: string;
  fee_amount: string;
  dispute_reason: string | null;
  resolution_note: string | null;
  version: number;
  created_at: string;
  ride: {
    rider?: RidePerson;
    driver?: { user: RidePerson } | null;
    vehicle?: {
      make: string;
      model: string;
      plate_number: string;
      vehicle_category: { name: string } | null;
    } | null;
    rider_id: string;
    status: string;
    pickup_address: string;
    dropoff_address: string;
    matched_at: string | null;
    arrived_at: string | null;
    cancelled_at: string | null;
    events: {
      id: string;
      event_type: string;
      created_at: string;
      metadata: unknown;
    }[];
  };
};
export type TripReviewPage = {
  items: TripReview[];
  total: number;
  page: number;
  page_size: number;
};
