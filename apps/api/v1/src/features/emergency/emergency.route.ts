import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { EMERGENCY_ROUTE } from './emergency.constant.js';
import { create, list, remove, update } from './emergency.controller.js';

export const emergency_router = Router();
emergency_router.get(EMERGENCY_ROUTE, require_auth, async_handler(list));
emergency_router.post(EMERGENCY_ROUTE, require_auth, async_handler(create));
emergency_router.patch(`${EMERGENCY_ROUTE}/:id`, require_auth, async_handler(update));
emergency_router.delete(`${EMERGENCY_ROUTE}/:id`, require_auth, async_handler(remove));
emergency_router.get(`/me${EMERGENCY_ROUTE}`, require_auth, async_handler(list));
emergency_router.post(`/me${EMERGENCY_ROUTE}`, require_auth, async_handler(create));
emergency_router.patch(`/me${EMERGENCY_ROUTE}/:id`, require_auth, async_handler(update));
emergency_router.delete(`/me${EMERGENCY_ROUTE}/:id`, require_auth, async_handler(remove));
