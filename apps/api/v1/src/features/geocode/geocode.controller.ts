import type { Request, Response } from 'express';
import { send_success } from '../../core/response.js';
import {
  GEOCODE_REVERSE_MESSAGE,
  GEOCODE_SEARCH_MESSAGE,
} from './geocode.constant.js';
import { reverse_schema, route_schema, search_schema } from './geocode.type.js';
import {
  driving_route,
  reverse_geocode,
  search_places,
} from './geocode.service.js';

export const search = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await search_places(search_schema.parse(request.query)),
    GEOCODE_SEARCH_MESSAGE,
  );
};

export const reverse = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await reverse_geocode(reverse_schema.parse(request.query)),
    GEOCODE_REVERSE_MESSAGE,
  );
};

export const route = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await driving_route(route_schema.parse(request.query)),
    'Driving route loaded',
  );
};
