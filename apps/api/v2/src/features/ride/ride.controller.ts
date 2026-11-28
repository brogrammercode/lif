import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { z } from 'zod';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard } from '../../core/guards.js';
import { IdempotencyInterceptor } from '../../core/idempotency.interceptor.js';
import { success } from '../../core/response.js';
import { DriverOperationsService } from '../driver_operations/driver_operations.service.js';
import { RideService } from './ride.service.js';
import { RIDE_ROUTES } from './ride.route.js';
import {
  QUOTE_CREATED_MESSAGE,
  RIDE_CANCELLED_MESSAGE,
  RIDE_CREATED_MESSAGE,
  RIDE_EVENTS_LOADED_MESSAGE,
  RIDE_LOADED_MESSAGE,
  RIDE_LOCATIONS_LOADED_MESSAGE,
  RIDES_LOADED_MESSAGE,
  REVIEW_CREATED_MESSAGE,
  RIDE_START_CONFIRMED_MESSAGE,
} from './ride.constant.js';
import {
  cancel_ride_schema,
  create_ride_schema,
  quote_schema,
  review_schema,
  ride_list_schema,
  availability_schema,
} from './ride.type.js';

@Controller()
@UseGuards(AuthGuard)
export class RideController {
  constructor(
    private readonly rideService: RideService,
    private readonly operations: DriverOperationsService,
  ) {}

  @Get('rides/availability')
  async availability(
    @CurrentUserId() user: string,
    @Query(new ZodValidationPipe(availability_schema))
    input: z.output<typeof availability_schema>,
  ) {
    return success(
      await this.operations.rider_availability(user, input),
      'Nearby availability loaded',
    );
  }

  @Post(RIDE_ROUTES.QUOTE)
  @HttpCode(201)
  async quote(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(quote_schema))
    input: z.output<typeof quote_schema>,
  ) {
    return success(
      await this.rideService.build_quote(user, input),
      QUOTE_CREATED_MESSAGE,
    );
  }

  @Post(RIDE_ROUTES.CREATE)
  @HttpCode(201)
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(create_ride_schema))
    input: z.output<typeof create_ride_schema>,
  ) {
    return success(
      await this.rideService.submit_ride(user, input),
      RIDE_CREATED_MESSAGE,
    );
  }

  @Get(RIDE_ROUTES.LIST)
  async list(
    @CurrentUserId() user: string,
    @Query(new ZodValidationPipe(ride_list_schema))
    input: z.output<typeof ride_list_schema>,
  ) {
    return success(
      await this.rideService.get_rides(user, input.page, input.page_size),
      RIDES_LOADED_MESSAGE,
    );
  }

  @Get(RIDE_ROUTES.DETAIL)
  async detail(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    return success(
      await this.rideService.get_ride(user, id),
      RIDE_LOADED_MESSAGE,
    );
  }

  @Get(RIDE_ROUTES.EVENTS)
  async events(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    return success(
      await this.rideService.get_ride_events(user, id),
      RIDE_EVENTS_LOADED_MESSAGE,
    );
  }

  @Get(RIDE_ROUTES.LOCATIONS)
  async locations(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    return success(
      await this.rideService.get_ride_locations(user, id),
      RIDE_LOCATIONS_LOADED_MESSAGE,
    );
  }

  @Post(RIDE_ROUTES.CANCEL)
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  async cancel(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Body(new ZodValidationPipe(cancel_ride_schema))
    input: z.output<typeof cancel_ride_schema>,
  ) {
    return success(
      await this.operations.report_issue(
        user,
        id,
        'CANCELLATION',
        input.cancel_reason,
      ),
      RIDE_CANCELLED_MESSAGE,
    );
  }

  @Post(RIDE_ROUTES.CONFIRM_START)
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  async confirm_start(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    return success(
      await this.operations.start_proof(user, id),
      RIDE_START_CONFIRMED_MESSAGE,
    );
  }

  @Post(RIDE_ROUTES.REVIEW)
  @HttpCode(201)
  async review(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Body(new ZodValidationPipe(review_schema))
    input: z.output<typeof review_schema>,
  ) {
    return success(
      await this.rideService.submit_review(user, id, input),
      REVIEW_CREATED_MESSAGE,
    );
  }
}
