import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { ride_list_schema } from '../ride/ride.type.js';
import {
  rider_history_schema,
  type RiderHistoryInput,
} from './dto/ride-history.dto.js';
import { TravelContextService } from './travel_context.service.js';

@Controller()
@UseGuards(AuthGuard)
export class TravelContextController {
  constructor(private readonly service: TravelContextService) {}
  @Get('me/travel-context')
  async context(@CurrentUserId() userId: string) {
    return success(await this.service.context(userId), 'Travel context loaded');
  }

  @Get('driver/rides/current')
  async current(@CurrentUserId() userId: string) {
    return success(
      await this.service.current(userId),
      'Current driver ride loaded',
    );
  }

  @Get('me/rides')
  async rider_history(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(rider_history_schema))
    input: RiderHistoryInput,
  ) {
    return success(
      await this.service.rider_history(
        userId,
        input.page,
        input.page_size,
        input.section,
        input,
      ),
      'Rider history loaded',
    );
  }

  @Get('driver/rides')
  async list(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(ride_list_schema))
    pagination: z.infer<typeof ride_list_schema>,
  ) {
    return success(
      await this.service.list(userId, pagination.page, pagination.page_size),
      'Driver rides loaded',
    );
  }

  @Get('driver/rides/:id')
  async detail(
    @CurrentUserId() userId: string,
    @Param('id', new ZodValidationPipe(z.string().min(1).max(100))) id: string,
  ) {
    return success(await this.service.detail(userId, id), 'Driver ride loaded');
  }
}
