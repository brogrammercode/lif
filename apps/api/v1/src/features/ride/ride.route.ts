import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { require_idempotency } from '../../middleware/idempotency.middleware.js';
import { CANCEL_ROUTE, CONFIRM_START_ROUTE, EVENTS_ROUTE, LOCATIONS_ROUTE, QUOTE_ROUTE, RIDE_ROUTE, REVIEWS_ROUTE } from './ride.constant.js';
import { cancel, confirm_start, create, detail, events, list, locations, quote, review } from './ride.controller.js';

export const ride_router = Router();
ride_router.post(`${RIDE_ROUTE}${QUOTE_ROUTE}`, require_auth, async_handler(quote));
ride_router.post(RIDE_ROUTE, require_auth, require_idempotency, async_handler(create));
ride_router.get(RIDE_ROUTE, require_auth, async_handler(list));
ride_router.get(`${RIDE_ROUTE}/:id`, require_auth, async_handler(detail));
ride_router.get(`${RIDE_ROUTE}/:id${EVENTS_ROUTE}`, require_auth, async_handler(events));
ride_router.get(`${RIDE_ROUTE}/:id${LOCATIONS_ROUTE}`, require_auth, async_handler(locations));
ride_router.post(`${RIDE_ROUTE}/:id${CANCEL_ROUTE}`, require_auth, require_idempotency, async_handler(cancel));
ride_router.post(`${RIDE_ROUTE}/:id${CONFIRM_START_ROUTE}`, require_auth, require_idempotency, async_handler(confirm_start));
ride_router.post(`${RIDE_ROUTE}/:id${REVIEWS_ROUTE}`, require_auth, async_handler(review));
