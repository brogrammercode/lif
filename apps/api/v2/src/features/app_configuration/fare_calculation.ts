import { Decimal } from 'decimal.js';
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
    commission_percent: fare_number(2, 100).optional(),
  })
  .strict();
export type CategoryFare = z.infer<typeof category_fare_input>;
type FareValue = Decimal | string | null | undefined;
const fareNumber = (value: FareValue) =>
  value == null ? undefined : Number(value);

export function category_fare_values(category: {
  max_profit_km?: FareValue;
  normal_fare_per_km?: FareValue;
  profit_fare_per_km?: FareValue;
  commission_percent?: FareValue;
}): CategoryFare | null {
  const parsed = category_fare_input.safeParse({
    max_profit_km: fareNumber(category.max_profit_km),
    normal_fare_per_km: fareNumber(category.normal_fare_per_km),
    profit_fare_per_km: fareNumber(category.profit_fare_per_km),
    commission_percent: fareNumber(category.commission_percent) ?? 0,
  });
  return parsed.success ? parsed.data : null;
}
export const category_fare_data = (fare: CategoryFare | null) => ({
  max_profit_km: fare?.max_profit_km ?? null,
  normal_fare_per_km: fare?.normal_fare_per_km ?? null,
  profit_fare_per_km: fare?.profit_fare_per_km ?? null,
  ...(fare?.commission_percent !== undefined
    ? { commission_percent: fare.commission_percent }
    : {}),
});

/** Round money once after adding both distance bands; duration is not priced. */
export function calculate_distance_fare(
  distance_m: number,
  rate: {
    max_profit_km: Decimal | number;
    normal_fare_per_km: Decimal | number;
    profit_fare_per_km: Decimal | number;
  },
) {
  if (!Number.isFinite(distance_m) || distance_m < 0)
    throw new AppError(
      422,
      'ROUTE_DISTANCE_INVALID',
      'A valid route distance is required before calculating the fare.',
    );
  const distance = new Decimal(distance_m).div(1000);
  const profit_km = Decimal.min(distance, rate.max_profit_km);
  const normal_km = Decimal.max(distance.minus(rate.max_profit_km), 0);
  return profit_km
    .mul(rate.profit_fare_per_km)
    .plus(normal_km.mul(rate.normal_fare_per_km))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
