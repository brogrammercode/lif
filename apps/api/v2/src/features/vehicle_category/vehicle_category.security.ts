import type { FareQuote, Prisma } from '@prisma/client';
import { has_approved_vehicle_fields } from '../vehicle_verification/vehicle_verification.type.js';
export const MATCHING_VEHICLE_INCLUDE = {
  vehicle_category: {
    include: { parent: true, _count: { select: { children: true } } },
  },
  brand: { select: { id: true, name: true, status: true, is_active: true } },
  catalog_model: {
    select: {
      id: true,
      name: true,
      brand_id: true,
      status: true,
      is_active: true,
      vehicle_type: true,
      seating_capacity: true,
    },
  },
} as const;
type MatchingVehicle = Prisma.VehicleGetPayload<{
  include: typeof MATCHING_VEHICLE_INCLUDE;
}>;
type MatchingQuote = Pick<
  FareQuote,
  'vehicle_category_id' | 'vehicle_type' | 'category_snapshot'
>;
export const is_vehicle_eligible = (
  vehicle: MatchingVehicle | null,
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
