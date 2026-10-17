export const VEHICLE_CATEGORY_ROUTES = {
  CATALOG: ['vehicle-categories'],
  ADMIN_CATALOG: ['admin/vehicle-categories'],
  CREATE: ['admin/vehicle-categories'],
  UPDATE: ['admin/vehicle-categories/:id'],
} satisfies Record<string, string[]>;
