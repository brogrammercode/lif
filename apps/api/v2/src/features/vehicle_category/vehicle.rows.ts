// PostgreSQL query row and persisted status types.
import type { JsonValue } from '../../database/json-value.js';

type VehicleType = 'BIKE' | 'SCOOTER' | 'AUTO' | 'SEDAN' | 'SUV';

type VehicleStatus = 'ACTIVE' | 'INACTIVE' | 'UNDER_REVIEW' | 'REJECTED';

export type Vehicle = {
  id: string;
  driver_id: string;
  type: VehicleType;
  status: VehicleStatus;
  make: string;
  model: string;
  color: string | null;
  plate_number: string;
  capacity: number;
  photo_url: string | null;
  metadata: JsonValue | null;
  vehicle_category_id: string | null;
  brand_id: string | null;
  model_id: string | null;
  registration_key: string | null;
  verification_fields: JsonValue;
  verification_version: number;
  created_at: Date;
  updated_at: Date;
};
