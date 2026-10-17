export const SUPPORT_ROUTES = {
  LIST: ['support/tickets'],
  DETAIL: ['support/tickets/:id'],
  CREATE: ['support/tickets'],
  MESSAGE: ['support/tickets/:id/messages'],
} satisfies Record<string, string[]>;
