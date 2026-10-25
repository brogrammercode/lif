import type { CategoryFare } from "../../types/domain";

export const categoryRateFields = [
  {
    key: "max_profit_km",
    label: "Max KM for Profit Fare",
    hint: "First distance band charged at the profit rate; this is not a fare cap.",
    step: "0.001",
    places: 3,
    max: 100000,
  },
  {
    key: "normal_fare_per_km",
    label: "Normal Fare per KM",
    hint: "INR per km beyond the first distance band.",
    step: "0.01",
    places: 2,
    max: 1000000,
  },
  {
    key: "profit_fare_per_km",
    label: "Profit Fare per KM",
    hint: "INR per km within the first distance band.",
    step: "0.01",
    places: 2,
    max: 1000000,
  },
] as const;

/** Match the strict API fare schema at both admin response boundaries. */
export function isCategoryFare(value: unknown): value is CategoryFare {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fare = value as Record<string, unknown>;
  return (
    Object.keys(fare).length === categoryRateFields.length &&
    categoryRateFields.every((field) => {
      const number = fare[field.key];
      return (
        typeof number === "number" &&
        Number.isFinite(number) &&
        number >= 0 &&
        number <= field.max &&
        Math.abs(
          number * 10 ** field.places - Math.round(number * 10 ** field.places),
        ) < 0.00001
      );
    })
  );
}

/** A category revision must be a real UTC instant, not a normalized invalid date. */
export function isCategoryRevision(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    return false;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return false;
  const normalized = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  return new Date(instant).toISOString() === normalized;
}
