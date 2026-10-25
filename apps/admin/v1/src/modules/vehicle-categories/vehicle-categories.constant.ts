import type { CategoryInput, VehicleFamily } from "../../types/domain";
export const CATEGORY_ENDPOINT = "/admin/vehicle-categories";
export const PAGE_SIZE = 10;
export const VEHICLE_FAMILIES: { value: VehicleFamily; label: string }[] = [
  { value: "BIKE", label: "Bike" },
  { value: "SCOOTER", label: "Scooter" },
  { value: "AUTO", label: "Auto" },
  { value: "SEDAN", label: "Sedan" },
  { value: "SUV", label: "SUV" },
];
export const EMPTY_CATEGORY: CategoryInput = {
  name: "",
  description: "",
  image_url: "",
  parent_id: null,
  vehicle_type: "BIKE",
  capacity: 1,
  fare_policy: null,
  is_active: true,
  sort_order: 0,
};
export const CATEGORY_COPY = {
  TITLE: "Vehicle categories",
  DESCRIPTION:
    "The right ride starts with the right choices. Configure what your riders see and drivers register for.",
  EMPTY: "Your next journey starts here",
  EMPTY_DESCRIPTION:
    "Create a vehicle category, then add subcategories when you need more specific ride options.",
  NO_RESULTS: "No matching categories",
  NO_RESULTS_DESCRIPTION:
    "Try another search or clear the filters to see all categories.",
  ERROR: "Could not load vehicle categories",
  SAVED: "Category saved. Rider and driver choices are up to date.",
  CREATED: "Category created and ready to configure.",
} as const;
