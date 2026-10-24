import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  Param,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { ride_list_schema } from '../ride/ride.type.js';
import { TravelContextService } from './travel_context.service.js';

@Controller()
@UseGuards(AuthGuard)
export class TravelContextController {
  constructor(private readonly service: TravelContextService) {}
  @Get('me/travel-context')
  async context(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.service.context(request.auth!.user_id),
      'Travel context loaded',
    );
  }
  @Get('driver/rides/current')
  async current(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.service.current(request.auth!.user_id),
      'Current driver ride loaded',
    );
  }
  @Get('me/rides')
  async rider_history(
    @Req() req: Request,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = z
      .object({
        page: z.coerce.number().int().min(1).max(1000000).default(1),
        page_size: z.coerce.number().int().min(1).max(100).default(20),
        section: z.enum(['all', 'active', 'past']).default('all'),
      })
      .strict()
      .parse(query);
    return send_success(
      res,
      await this.service.rider_history(
        req.auth!.user_id,
        input.page,
        input.page_size,
        input.section,
      ),
      'Rider history loaded',
    );
  }
  @Get('driver/rides')
  async list(
    @Req() request: Request,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const pagination = ride_list_schema.parse(query);
    return send_success(
      response,
      await this.service.list(
        request.auth!.user_id,
        pagination.page,
        pagination.page_size,
      ),
      'Driver rides loaded',
    );
  }
  @Get('driver/rides/:id')
  async detail(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.service.detail(
        request.auth!.user_id,
        z.string().min(1).max(100).parse(id),
      ),
      'Driver ride loaded',
    );
  }
}
