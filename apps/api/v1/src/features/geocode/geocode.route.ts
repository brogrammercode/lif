import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import {
  GEOCODE_ROUTE,
  REVERSE_ROUTE,
  SEARCH_ROUTE,
} from './geocode.constant.js';
import { reverse, route, search } from './geocode.controller.js';

export const geocode_router = Router();
geocode_router.get(`${GEOCODE_ROUTE}${SEARCH_ROUTE}`, async_handler(search));
geocode_router.get(`${GEOCODE_ROUTE}${REVERSE_ROUTE}`, async_handler(reverse));
geocode_router.get(`${GEOCODE_ROUTE}/route`, async_handler(route));
