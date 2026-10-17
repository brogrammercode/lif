import type { FareQuote, Prisma } from '@prisma/client';

export const MATCHING_VEHICLE_INCLUDE = {
  vehicle_category: {
    include: { parent: true, _count: { select: { children: true } } },
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
