export const CATEGORY_ROUTE = '/vehicle-categories';
export const ADMIN_CATEGORY_ROUTE = '/admin/vehicle-categories';
export const CATEGORY_MESSAGES = {
  LOADED: 'Vehicle categories loaded',
  CREATED: 'Vehicle category created',
  UPDATED: 'Vehicle category updated',
  NOT_FOUND: 'Vehicle category was not found',
  UNAVAILABLE:
    'This vehicle category is not available. Choose an enabled category or subcategory.',
  EMPTY: 'No vehicle categories are available for this journey.',
  PARENT:
    'Choose a top-level category as the parent. Only one level of subcategories is supported.',
  USED_PARENT:
    'A category with registered vehicles cannot become a group. Create a new group or move its vehicles first.',
  TYPE_LOCKED:
    'The vehicle family cannot change after registrations or quotes use this category. Create a new category for another vehicle family.',
  CONFLICT:
    'This category was changed by another admin. Refresh and try again.',
  TYPE_MISMATCH: 'The category must match the physical vehicle family.',
} as const;
