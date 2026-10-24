import { DriverOperationsService } from '../driver_operations/driver_operations.service.js';
import {
  Controller,
  HttpCode,
  Req,
  Res,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RideService } from './ride.service.js';
import { AuthGuard } from '../../core/guards.js';
import { IdempotencyInterceptor } from '../../core/idempotency.interceptor.js';
import { RIDE_ROUTES } from './ride.route.js';
import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
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
} from './ride.type.js';
@Controller()
export class RideController {
  constructor(
    private readonly rideService: RideService,
    private readonly operations: DriverOperationsService,
  ) {}
  readonly current_user_id = (request: Request): string => {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    return request.auth.user_id;
  };

  @Post(RIDE_ROUTES.QUOTE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async quote(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.rideService.build_quote(
        this.current_user_id(request),
        quote_schema.parse(request.body),
      ),
      QUOTE_CREATED_MESSAGE,
      201,
    );
  }

  @Post(RIDE_ROUTES.CREATE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.rideService.submit_ride(
        this.current_user_id(request),
        create_ride_schema.parse(request.body),
      ),
      RIDE_CREATED_MESSAGE,
      201,
    );
  }

  @Get(RIDE_ROUTES.LIST)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const pagination = ride_list_schema.parse(request.query);
    return send_success(
      response,
      await this.rideService.get_rides(
        this.current_user_id(request),
        pagination.page,
        pagination.page_size,
      ),
      RIDES_LOADED_MESSAGE,
    );
  }

  @Get(RIDE_ROUTES.DETAIL)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async detail(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.rideService.get_ride(
        this.current_user_id(request),
        request.params.id as string,
      ),
      RIDE_LOADED_MESSAGE,
    );
  }

  @Get(RIDE_ROUTES.EVENTS)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async events(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.rideService.get_ride_events(
        this.current_user_id(request),
        request.params.id as string,
      ),
      RIDE_EVENTS_LOADED_MESSAGE,
    );
  }

  @Get(RIDE_ROUTES.LOCATIONS)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async locations(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.rideService.get_ride_locations(
        this.current_user_id(request),
        request.params.id as string,
      ),
      RIDE_LOCATIONS_LOADED_MESSAGE,
    );
  }

  @Post(RIDE_ROUTES.CANCEL)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async cancel(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.operations.report_issue(
        this.current_user_id(request),
        request.params.id as string,
        'CANCELLATION',
        cancel_ride_schema.parse(request.body).cancel_reason,
      ),
      RIDE_CANCELLED_MESSAGE,
    );
  }

  @Post(RIDE_ROUTES.CONFIRM_START)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async confirm_start(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.operations.start_proof(
        this.current_user_id(request),
        request.params.id as string,
      ),
      RIDE_START_CONFIRMED_MESSAGE,
    );
  }

  @Post(RIDE_ROUTES.REVIEW)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async review(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.rideService.submit_review(
        this.current_user_id(request),
        request.params.id as string,
        review_schema.parse(request.body),
      ),
      REVIEW_CREATED_MESSAGE,
      201,
    );
  }
}
