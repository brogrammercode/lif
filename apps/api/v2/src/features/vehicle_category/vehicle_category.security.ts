import { has_approved_vehicle_fields } from '../vehicle_verification/vehicle_verification.type.js';
import type { Vehicle } from './vehicle.rows.js';
type EligibilityVehicle = {
  driver_id: string;
  status: string;
  verification_version: number;
  verification_fields: unknown;
  brand_id: string | null;
  type: string;
  capacity: number;
  vehicle_category_id: string | null;
  brand: {
    id: string;
    name: string;
    logo_url: string | null;
    is_active: boolean;
    status: string;
  } | null;
  catalog_model: {
    id: string;
    name: string;
    logo_url?: string | null;
    is_active: boolean;
    status: string;
    brand_id: string;
    vehicle_type: string;
    seating_capacity: number;
  } | null;
  vehicle_category: {
    id: string;
    name: string;
    image_url: string | null;
    logo_url?: string | null;
    is_active: boolean;
    _count: { children: number };
    parent: { is_active: boolean } | null;
    capacity: number;
    vehicle_type: string;
  } | null;
};
type MatchingQuote = {
  vehicle_category_id: string | null;
  vehicle_type: string;
  category_snapshot: unknown;
};
export type MatchingVehicle = Vehicle & EligibilityVehicle;
export const is_vehicle_eligible = (
  vehicle:
    | (Pick<
        EligibilityVehicle,
        Exclude<
          keyof EligibilityVehicle,
          'brand' | 'catalog_model' | 'vehicle_category'
        >
      > & {
        brand: Pick<
          NonNullable<EligibilityVehicle['brand']>,
          'is_active' | 'status'
        > | null;
        catalog_model: Omit<
          NonNullable<EligibilityVehicle['catalog_model']>,
          'id' | 'name' | 'logo_url'
        > | null;
        vehicle_category: Omit<
          NonNullable<EligibilityVehicle['vehicle_category']>,
          'id' | 'name' | 'image_url' | 'logo_url'
        > | null;
      })
    | null,
  quote: MatchingQuote | undefined,
  driver_id: string,
) => {
  if (
    !vehicle ||
    !quote ||
    vehicle.driver_id !== driver_id ||
    vehicle.status !== 'ACTIVE'
  )
    return false;
  const category = vehicle.vehicle_category;
  if (
    vehicle.verification_version > 0 &&
    (!has_approved_vehicle_fields(vehicle.verification_fields) ||
      !vehicle.brand?.is_active ||
      vehicle.brand.status !== 'VERIFIED' ||
      !vehicle.catalog_model?.is_active ||
      vehicle.catalog_model.status !== 'VERIFIED' ||
      vehicle.catalog_model.brand_id !== vehicle.brand_id ||
      vehicle.catalog_model.vehicle_type !== vehicle.type ||
      vehicle.catalog_model.seating_capacity < vehicle.capacity)
  )
    return false;
  if (
    !category ||
    !category.is_active ||
    category._count.children > 0 ||
    (category.parent && !category.parent.is_active)
  )
    return false;
  const snapshot = quote.category_snapshot;
  const seats =
    snapshot &&
    typeof snapshot === 'object' &&
    !Array.isArray(snapshot) &&
    'capacity' in snapshot &&
    typeof snapshot.capacity === 'number'
      ? snapshot.capacity
      : category.capacity;
  return (
    vehicle.type === category.vehicle_type &&
    vehicle.type === quote.vehicle_type &&
    vehicle.vehicle_category_id === quote.vehicle_category_id &&
    vehicle.capacity >= Math.max(seats, category.capacity)
  );
};
