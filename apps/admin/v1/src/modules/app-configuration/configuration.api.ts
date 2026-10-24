import { apiRequest } from "../../lib/api-client";
export const fareGroups = [
  {
    key: "AUTO_TOTO",
    label: "Auto / Toto",
    description: "Auto categories and their subcategories.",
  },
  {
    key: "BIKE_SCOOTER",
    label: "Bike / Scooter",
    description: "Bike and scooter categories share this policy.",
  },
  {
    key: "CAR",
    label: "Car",
    description: "Sedan and SUV categories share this policy.",
  },
] as const;
export type FareGroup = (typeof fareGroups)[number]["key"];
export type FareRate = {
  group: FareGroup;
  max_profit_km: number;
  normal_fare_per_km: number;
  profit_fare_per_km: number;
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
  const { version, updated_at: _, updated_by: __, ...settings } = value;
  return apiRequest<FarePolicy>("/admin/fare-policy", {
    method: "PATCH",
    signal,
    data: { expected_version: version, ...settings },
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
