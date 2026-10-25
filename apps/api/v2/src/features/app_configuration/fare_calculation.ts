import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../core/error.js';

const fare_number = (places: number, maximum: number) =>
  z
    .number()
    .finite()
    .nonnegative()
    .max(maximum)
    .refine(
      (v) =>
        Math.abs(v * 10 ** places - Math.round(v * 10 ** places)) < 0.00001,
      `Use at most ${places} decimal places`,
    );
export const category_fare_input = z
  .object({
    max_profit_km: fare_number(3, 100000),
    normal_fare_per_km: fare_number(2, 1000000),
    profit_fare_per_km: fare_number(2, 1000000),
  })
  .strict();
export type CategoryFare = z.infer<typeof category_fare_input>;
export function category_fare_values(category: {
  max_profit_km?: Prisma.Decimal | null;
  normal_fare_per_km?: Prisma.Decimal | null;
  profit_fare_per_km?: Prisma.Decimal | null;
}): CategoryFare | null {
  const parsed = category_fare_input.safeParse({
    max_profit_km: category.max_profit_km?.toNumber(),
    normal_fare_per_km: category.normal_fare_per_km?.toNumber(),
    profit_fare_per_km: category.profit_fare_per_km?.toNumber(),
  });
  return parsed.success ? parsed.data : null;
}
export const category_fare_data = (fare: CategoryFare | null) => ({
  max_profit_km: fare?.max_profit_km ?? null,
  normal_fare_per_km: fare?.normal_fare_per_km ?? null,
  profit_fare_per_km: fare?.profit_fare_per_km ?? null,
});

/** Round money once after adding both distance bands; duration is not priced. */
export function calculate_distance_fare(
  distance_m: number,
  rate: {
    max_profit_km: Prisma.Decimal | number;
    normal_fare_per_km: Prisma.Decimal | number;
    profit_fare_per_km: Prisma.Decimal | number;
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
