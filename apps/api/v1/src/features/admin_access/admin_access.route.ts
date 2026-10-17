import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { require_admin } from '../admin_auth/admin_auth.middleware.js';
import { ADMIN_ACCESS_ROUTE } from './admin_access.constant.js';
import { list, grant, revoke } from './admin_access.controller.js';

export const admin_access_router = Router();
const path = `/${ADMIN_ACCESS_ROUTE}`;
admin_access_router.use(path, require_auth, require_admin);
admin_access_router.get(path, async_handler(list));
admin_access_router.post(path, async_handler(grant));
admin_access_router.delete(`${path}/:id`, async_handler(revoke));
