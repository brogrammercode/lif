import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { current_user } from '../auth/auth.controller.js';
import { NOTIFICATIONS_ROUTE, SAVED_PLACES_ROUTE, USER_ROUTE } from './user.constant.js';
import { delete_place, get_places, get_user_notifications, patch_notification, patch_place, post_place, update_avatar, update_me } from './user.controller.js';

export const user_router = Router();
user_router.get(USER_ROUTE, require_auth, async_handler(current_user));
user_router.patch(USER_ROUTE, require_auth, async_handler(update_me));
user_router.post(`${USER_ROUTE}/avatar`, require_auth, async_handler(update_avatar));
user_router.get(`${USER_ROUTE}${SAVED_PLACES_ROUTE}`, require_auth, async_handler(get_places));
user_router.post(`${USER_ROUTE}${SAVED_PLACES_ROUTE}`, require_auth, async_handler(post_place));
user_router.patch(`${USER_ROUTE}${SAVED_PLACES_ROUTE}/:id`, require_auth, async_handler(patch_place));
user_router.delete(`${USER_ROUTE}${SAVED_PLACES_ROUTE}/:id`, require_auth, async_handler(delete_place));
user_router.get(`${USER_ROUTE}${NOTIFICATIONS_ROUTE}`, require_auth, async_handler(get_user_notifications));
user_router.post(`${USER_ROUTE}${NOTIFICATIONS_ROUTE}/:id/read`, require_auth, async_handler(patch_notification));
