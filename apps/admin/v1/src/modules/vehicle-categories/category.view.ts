import type { VehicleCategory } from "../../types/domain";
export type CategoryStatus = "all" | "enabled" | "disabled";
export const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
export function filterCatalog(
  categories: VehicleCategory[],
  query: string,
  status: CategoryStatus,
) {
  const normalized = query.trim().toLocaleLowerCase();
  const ordered = [...categories].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  const flattened = ordered
    .filter((category) => !category.parent_id)
    .flatMap((root) => [
      root,
      ...ordered.filter((category) => category.parent_id === root.id),
    ]);
  return flattened.filter(
    (category) =>
      (!normalized ||
        [category.name, category.description, category.parent_name].some(
          (value) => value?.toLocaleLowerCase().includes(normalized),
        )) &&
      (status === "all" ||
        (status === "enabled"
          ? category.effective_active
          : !category.effective_active)),
  );
}
