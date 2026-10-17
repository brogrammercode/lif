import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { require_admin } from '../admin_auth/admin_auth.middleware.js';
import { ADMIN_ROUTE, DRIVERS_ROUTE, OFFERS_ROUTE, RIDES_ROUTE, VERIFICATION_ROUTE } from './admin.constant.js';
import { offer, verification } from './admin.controller.js';

export const admin_router = Router();
admin_router.use(ADMIN_ROUTE, require_auth, require_admin);
admin_router.patch(`${ADMIN_ROUTE}${DRIVERS_ROUTE}/:id${VERIFICATION_ROUTE}`, async_handler(verification));
admin_router.post(`${ADMIN_ROUTE}${RIDES_ROUTE}/:id${OFFERS_ROUTE}`, async_handler(offer));
