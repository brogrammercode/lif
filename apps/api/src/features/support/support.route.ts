import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { require_idempotency } from '../../middleware/idempotency.middleware.js';
import { SUPPORT_ROUTE } from './support.constant.js';
import { create, detail, list, message } from './support.controller.js';

export const support_router = Router();
support_router.get(SUPPORT_ROUTE, require_auth, async_handler(list));
support_router.post(SUPPORT_ROUTE, require_auth, require_idempotency, async_handler(create));
support_router.get(`${SUPPORT_ROUTE}/:id`, require_auth, async_handler(detail));
support_router.post(`${SUPPORT_ROUTE}/:id/messages`, require_auth, async_handler(message));
