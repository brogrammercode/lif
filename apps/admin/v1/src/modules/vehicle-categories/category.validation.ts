import { ApiError } from "../../lib/api-client";
import { NETWORK_COPY } from "../../lib/network.constant";
import type { VehicleCategory } from "../../types/domain";
import { VEHICLE_FAMILIES } from "./vehicle-categories.constant";

export function readCategory(value: unknown): VehicleCategory {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(NETWORK_COPY.INVALID_RESPONSE, 502);
  const item = value as Partial<VehicleCategory>;
  const validText = [item.id, item.code, item.name].every(
    (field) => typeof field === "string" && field.length > 0,
  );
  const validOptionalText = [
    item.description,
    item.image_url,
    item.parent_id,
    item.parent_name,
  ].every((field) => field === null || typeof field === "string");
  const validNumbers = [
    item.capacity,
    item.base_fare,
    item.per_kilometer,
    item.per_minute,
    item.sort_order,
  ].every(
    (field) =>
      typeof field === "number" && Number.isFinite(field) && field >= 0,
  );
  const validCounts =
    item._count &&
    [item._count.children, item._count.vehicles, item._count.quotes ?? 0].every(
      (field) =>
        typeof field === "number" && Number.isInteger(field) && field >= 0,
    );
  const validFlags = [
    item.is_active,
    item.effective_active,
    item.is_selectable,
  ].every((field) => typeof field === "boolean");
  const validDates = [item.created_at, item.updated_at].every(
    (field) => typeof field === "string" && Number.isFinite(Date.parse(field)),
  );
  if (
    !validText ||
    !validOptionalText ||
    !validNumbers ||
    !validCounts ||
    !validFlags ||
    !validDates ||
    !VEHICLE_FAMILIES.some((family) => family.value === item.vehicle_type) ||
    !Number.isInteger(item.capacity) ||
    item.capacity! < 1 ||
    item.capacity! > 8 ||
    !Number.isInteger(item.sort_order)
  )
    throw new ApiError(NETWORK_COPY.INVALID_RESPONSE, 502);
  return item as VehicleCategory;
}

export function readCatalog(value: unknown): VehicleCategory[] {
  if (!Array.isArray(value))
    throw new ApiError(NETWORK_COPY.INVALID_RESPONSE, 502);
  const categories = value.map(readCategory);
  const byId = new Map(categories.map((category) => [category.id, category]));
  if (
    byId.size !== categories.length ||
    categories.some(
      (category) =>
        category.parent_id &&
        (!byId.has(category.parent_id) ||
          category.parent_id === category.id ||
          byId.get(category.parent_id)?.parent_id),
    )
  )
    throw new ApiError(NETWORK_COPY.INVALID_RESPONSE, 502);
  return categories;
}
