import { Prisma, type FareGroup, type VehicleType } from '@prisma/client';
import { AppError } from '../../core/error.js';

export const fare_group_for = (type: VehicleType): FareGroup => {
  switch (type) {
    case 'AUTO':
      return 'AUTO_TOTO';
    case 'BIKE':
    case 'SCOOTER':
      return 'BIKE_SCOOTER';
    case 'SEDAN':
    case 'SUV':
      return 'CAR';
  }
};

/** Round money once after adding both distance bands; duration is not priced. */
export function calculate_distance_fare(
  distance_m: number,
  rate: {
    max_profit_km: Prisma.Decimal;
    normal_fare_per_km: Prisma.Decimal;
    profit_fare_per_km: Prisma.Decimal;
  },
) {
  if (!Number.isFinite(distance_m) || distance_m < 0)
    throw new AppError(
      422,
      'ROUTE_DISTANCE_INVALID',
      'A valid route distance is required before calculating the fare.',
    );
  const distance = new Prisma.Decimal(distance_m).div(1000);
  const profit_km = Prisma.Decimal.min(distance, rate.max_profit_km);
  const normal_km = Prisma.Decimal.max(distance.minus(rate.max_profit_km), 0);
  return profit_km
    .mul(rate.profit_fare_per_km)
    .plus(normal_km.mul(rate.normal_fare_per_km))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
