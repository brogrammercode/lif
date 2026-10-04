import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { HEALTH_ROUTE } from './health.constant.js';
import { get_health } from './health.controller.js';

export const health_router = Router();
health_router.get(HEALTH_ROUTE, async_handler(get_health));
