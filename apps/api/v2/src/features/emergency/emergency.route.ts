export const EMERGENCY_ROUTES = {
  LIST: ['emergency-contacts', 'me/emergency-contacts'],
  CREATE: ['emergency-contacts', 'me/emergency-contacts'],
  UPDATE: ['emergency-contacts/:id', 'me/emergency-contacts/:id'],
  REMOVE: ['emergency-contacts/:id', 'me/emergency-contacts/:id'],
} satisfies Record<string, string[]>;
