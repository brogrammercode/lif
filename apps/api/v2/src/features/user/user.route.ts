export const USER_ROUTES = {
  UPDATE_ME: ['me'],
  UPDATE_AVATAR: ['me/avatar'],
  UPDATE_LOCATION: ['me/location'],
  GET_PLACES: ['me/saved-places'],
  POST_PLACE: ['me/saved-places'],
  PATCH_PLACE: ['me/saved-places/:id'],
  DELETE_PLACE: ['me/saved-places/:id'],
  GET_USER_NOTIFICATIONS: ['me/notifications'],
  PATCH_NOTIFICATION: ['me/notifications/:id/read'],
} satisfies Record<string, string[]>;
