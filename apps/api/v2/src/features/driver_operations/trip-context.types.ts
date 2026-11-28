import type { Decimal } from 'decimal.js';
import type { JsonValue } from '../../database/json-value.js';
import type { MatchingVehicle } from '../vehicle_category/vehicle_category.security.js';
import type { Payment } from '../payment/payment.row.js';
import type { Vehicle } from '../vehicle_category/vehicle.rows.js';

type Ride = {
  passenger_count: number;
  collection_preference: 'CASH' | 'CARD' | 'UPI' | 'WALLET';
  search_radius_km: number | null;
  id: string;
  rider_id: string;
  driver_id: string | null;
  status:
    | 'DRAFT'
    | 'REQUESTED'
    | 'SEARCHING'
    | 'DRIVER_ASSIGNED'
    | 'DRIVER_ARRIVING'
    | 'DRIVER_WAITING'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'NO_DRIVER_FOUND';
  pickup_address: string;
  pickup_latitude: string;
  pickup_longitude: string;
  dropoff_address: string;
  dropoff_latitude: string;
  dropoff_longitude: string;
  requested_at: Date | null;
  matched_at: Date | null;
  arrived_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  rider_note: string | null;
  estimated_distance_m: number | null;
  estimated_duration_s: number | null;
  actual_distance_m: number | null;
  actual_duration_s: number | null;
  estimated_fare: string | null;
  final_fare: string | null;
  currency: string;
  created_at: Date;
  updated_at: Date;
};

type RideStartVerification = {
  ride_id: string;
  driver_id: string;
  assignment_at: Date;
  code_hash: string;
  code_ciphertext: string;
  expires_at: Date;
  attempts: number;
  rider_confirmed_at: Date | null;
  driver_verified_at: Date | null;
  used_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type RideSettlementReview = {
  id: string;
  ride_id: string;
  reported_by_id: string;
  driver_id: string | null;
  kind: string;
  status: string;
  reason: string;
  fee_amount: string;
  dispute_reason: string | null;
  resolved_by_id: string | null;
  resolution_note: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type FareQuote = {
  id: string;
  ride_id: string;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'AUTO' | 'SEDAN' | 'SUV';
  distance_m: number;
  duration_s: number;
  pickup_eta_s: number | null;
  base_fare: string;
  distance_fare: string;
  time_fare: string;
  surge_multiplier: string;
  total_fare: string;
  currency: string;
  expires_at: Date;
  selected_at: Date | null;
  vehicle_category_id: string | null;
  category_snapshot: JsonValue | null;
  created_at: Date;
  updated_at: Date;
};

type RideRoute = {
  id: string;
  ride_id: string;
  provider: string;
  encoded_polyline: string | null;
  route_data: JsonValue | null;
  distance_m: number;
  duration_s: number;
  created_at: Date;
  updated_at: Date;
};

type Person = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone_e164: string | null;
  status: string;
};
type Driver = {
  id: string;
  user_id: string;
  availability:
    'OFFLINE' | 'AVAILABLE' | 'EN_ROUTE' | 'ON_TRIP' | 'PAUSED' | 'SUSPENDED';
  verification_status: string;
  user: Person;
  active_vehicle: MatchingVehicle | null;
  rating_average: string;
  ratings_count: number;
  last_location_at: Date | null;
  last_location_accuracy_m: number | null;
  current_latitude: string | null;
  current_longitude: string | null;
};
type ReceiptVehicle = Pick<
  Vehicle,
  | 'id'
  | 'make'
  | 'model'
  | 'plate_number'
  | 'color'
  | 'type'
  | 'capacity'
  | 'photo_url'
> & {
  brand: { name: string; logo_url: string | null } | null;
};
type TripPayment = Pick<
  Payment,
  | 'id'
  | 'status'
  | 'provider'
  | 'provider_payment_id'
  | 'recipient_upi'
  | 'collection_method'
  | 'unpaid_reason'
  | 'amount'
  | 'updated_at'
>;
type TripProjection = {
  rider: Person;
  driver: Driver | null;
  quotes: FareQuote[];
  start_verification: RideStartVerification | null;
  payment: TripPayment | null;
  vehicle: ReceiptVehicle | null;
  route: RideRoute | null;
  events: { id: string; event_type: string; created_at: string }[];
  reviews: {
    id: string;
    reviewer_id: string;
    score: number;
    comment: string | null;
  }[];
};
export type ContextTrip = Ride &
  TripProjection & {
    settlement_review: RideSettlementReview | null;
    has_active_trip: boolean;
    contact_attempted: boolean;
    wallet_available: string | null;
    wallet_enabled: boolean | null;
    razorpay_upi_enabled: boolean | null;
  };
export type Trip = Omit<
  ContextTrip,
  'estimated_fare' | 'final_fare' | 'settlement_review'
> & {
  estimated_fare: Decimal | null;
  final_fare: Decimal | null;
  settlement_review:
    (Omit<RideSettlementReview, 'fee_amount'> & { fee_amount: Decimal }) | null;
};
