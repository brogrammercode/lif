import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { require_admin } from '../admin_auth/admin_auth.middleware.js';
import { ADMIN_USERS_ROUTE } from './admin_user.constant.js';
import { detail, list, update } from './admin_user.controller.js';

export const admin_user_router = Router();
admin_user_router.use(ADMIN_USERS_ROUTE, require_auth, require_admin);
admin_user_router.get(ADMIN_USERS_ROUTE, async_handler(list));
admin_user_router.get(`${ADMIN_USERS_ROUTE}/:id`, async_handler(detail));
admin_user_router.patch(`${ADMIN_USERS_ROUTE}/:id`, async_handler(update));
