export const ADMIN_ROUTES = {
  VERIFICATION: ['admin/drivers/:id/verification'],
  OFFER: ['admin/rides/:id/offers'],
} satisfies Record<string, string[]>;
