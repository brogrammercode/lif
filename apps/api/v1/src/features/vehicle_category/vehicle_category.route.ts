import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { require_admin } from '../admin_auth/admin_auth.middleware.js';
import {
  ADMIN_CATEGORY_ROUTE,
  CATEGORY_ROUTE,
} from './vehicle_category.constant.js';
import {
  admin_catalog,
  catalog,
  create,
  update,
} from './vehicle_category.controller.js';

export const vehicle_category_router = Router();
vehicle_category_router.get(
  CATEGORY_ROUTE,
  require_auth,
  async_handler(catalog),
);
vehicle_category_router.get(
  ADMIN_CATEGORY_ROUTE,
  require_auth,
  require_admin,
  async_handler(admin_catalog),
);
vehicle_category_router.post(
  ADMIN_CATEGORY_ROUTE,
  require_auth,
  require_admin,
  async_handler(create),
);
vehicle_category_router.patch(
  `${ADMIN_CATEGORY_ROUTE}/:id`,
  require_auth,
  require_admin,
  async_handler(update),
);
