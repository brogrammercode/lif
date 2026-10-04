import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { AUTH_ROUTE, GOOGLE_LOGIN_ROUTE, LOGOUT_ROUTE, ME_ROUTE, REFRESH_ROUTE } from './auth.constant.js';
import { current_user, google_login, refresh, revoke } from './auth.controller.js';

export const auth_router = Router();
auth_router.post(`${AUTH_ROUTE}${GOOGLE_LOGIN_ROUTE}`, async_handler(google_login));
auth_router.post(`${AUTH_ROUTE}${REFRESH_ROUTE}`, async_handler(refresh));
auth_router.post(`${AUTH_ROUTE}${LOGOUT_ROUTE}`, require_auth, async_handler(revoke));
auth_router.get(`${AUTH_ROUTE}${ME_ROUTE}`, require_auth, async_handler(current_user));
