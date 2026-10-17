export const RIDE_ROUTES = {
  QUOTE: ['rides/quote'],
  CREATE: ['rides'],
  LIST: ['rides'],
  DETAIL: ['rides/:id'],
  EVENTS: ['rides/:id/events'],
  LOCATIONS: ['rides/:id/locations'],
  CANCEL: ['rides/:id/cancel'],
  CONFIRM_START: ['rides/:id/confirm-start'],
  REVIEW: ['rides/:id/reviews'],
} satisfies Record<string, string[]>;
