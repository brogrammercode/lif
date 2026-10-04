import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { ACCEPT_ROUTE, ARRIVE_ROUTE, AVAILABILITY_ROUTE, COMPLETE_ROUTE, DRIVER_RIDES_ROUTE, DRIVER_ROUTE, LOCATION_ROUTE, OFFERS_ROUTE, PROFILE_ROUTE, REJECT_ROUTE, START_ROUTE, VEHICLES_ROUTE } from './driver.constant.js';
import { accept, arrive, availability, complete, create_profile, location, offers, profile, reject, start, vehicle } from './driver.controller.js';

export const driver_router = Router();
driver_router.get(`${DRIVER_ROUTE}${PROFILE_ROUTE}`, require_auth, async_handler(profile));
driver_router.get(`${DRIVER_ROUTE}/me`, require_auth, async_handler(profile));
driver_router.post(`${DRIVER_ROUTE}${PROFILE_ROUTE}`, require_auth, async_handler(create_profile));
driver_router.patch(`${DRIVER_ROUTE}${AVAILABILITY_ROUTE}`, require_auth, async_handler(availability));
driver_router.post(`${DRIVER_ROUTE}${VEHICLES_ROUTE}`, require_auth, async_handler(vehicle));
driver_router.get(`${DRIVER_ROUTE}${OFFERS_ROUTE}`, require_auth, async_handler(offers));
driver_router.post(`${DRIVER_ROUTE}${OFFERS_ROUTE}/:id${ACCEPT_ROUTE}`, require_auth, async_handler(accept));
driver_router.post(`${DRIVER_ROUTE}${OFFERS_ROUTE}/:id${REJECT_ROUTE}`, require_auth, async_handler(reject));
driver_router.post(`${DRIVER_ROUTE}${LOCATION_ROUTE}`, require_auth, async_handler(location));
driver_router.post(`${DRIVER_ROUTE}${DRIVER_RIDES_ROUTE}/:id${ARRIVE_ROUTE}`, require_auth, async_handler(arrive));
driver_router.post(`${DRIVER_ROUTE}${DRIVER_RIDES_ROUTE}/:id${START_ROUTE}`, require_auth, async_handler(start));
driver_router.post(`${DRIVER_ROUTE}${DRIVER_RIDES_ROUTE}/:id${COMPLETE_ROUTE}`, require_auth, async_handler(complete));
