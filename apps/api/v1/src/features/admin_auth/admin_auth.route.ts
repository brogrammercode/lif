import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { ADMIN_AUTH_ROUTE } from './admin_auth.constant.js';
import { google, logout, me, refresh } from './admin_auth.controller.js';
import {
  limit_admin_sign_in,
  require_admin,
  require_admin_origin,
} from './admin_auth.middleware.js';

export const admin_auth_router = Router();
admin_auth_router.post(
  `${ADMIN_AUTH_ROUTE}/google`,
  require_admin_origin,
  limit_admin_sign_in,
  async_handler(google),
);
admin_auth_router.post(
  `${ADMIN_AUTH_ROUTE}/refresh`,
  require_admin_origin,
  async_handler(refresh),
);
admin_auth_router.post(
  `${ADMIN_AUTH_ROUTE}/logout`,
  require_admin_origin,
  async_handler(logout),
);
admin_auth_router.get(
  `${ADMIN_AUTH_ROUTE}/me`,
  require_auth,
  require_admin,
  async_handler(me),
);
