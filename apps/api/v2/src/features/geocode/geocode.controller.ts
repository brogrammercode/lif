import { Controller, HttpCode, Req, Res, Get } from '@nestjs/common';
import { GeocodeService } from './geocode.service.js';
import { GEOCODE_ROUTES } from './geocode.route.js';
import type { Request, Response } from 'express';
import { send_success } from '../../core/response.js';
import {
  GEOCODE_REVERSE_MESSAGE,
  GEOCODE_SEARCH_MESSAGE,
} from './geocode.constant.js';
import { reverse_schema, route_schema, search_schema } from './geocode.type.js';
@Controller()
export class GeocodeController {
  constructor(private readonly geocodeService: GeocodeService) {}
  @Get(GEOCODE_ROUTES.SEARCH)
  @HttpCode(200)
  async search(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.geocodeService.search_places(
        search_schema.parse(request.query),
      ),
      GEOCODE_SEARCH_MESSAGE,
    );
  }

  @Get(GEOCODE_ROUTES.REVERSE)
  @HttpCode(200)
  async reverse(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.geocodeService.reverse_geocode(
        reverse_schema.parse(request.query),
      ),
      GEOCODE_REVERSE_MESSAGE,
    );
  }

  @Get(GEOCODE_ROUTES.ROUTE)
  @HttpCode(200)
  async route(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.geocodeService.driving_route(
        route_schema.parse(request.query),
      ),
      'Driving route loaded',
    );
  }
}
