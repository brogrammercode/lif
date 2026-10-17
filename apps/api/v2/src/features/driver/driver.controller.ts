import {
  Controller,
  HttpCode,
  Req,
  Res,
  Get,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { DriverService } from './driver.service.js';
import { AuthGuard } from '../../core/guards.js';
import { DRIVER_ROUTES } from './driver.route.js';
import type { Request, Response } from 'express';
import { vehicle_category_selection_schema } from './driver.type.js';
import {
  VEHICLE_CATEGORY_UPDATED_MESSAGE,
  ACTIVE_VEHICLE_UPDATED_MESSAGE,
} from './driver.constant.js';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import {
  DRIVER_ARRIVED_MESSAGE,
  DRIVER_AVAILABILITY_UPDATED_MESSAGE,
  DRIVER_LOCATION_UPDATED_MESSAGE,
  DRIVER_OFFER_ACCEPTED_MESSAGE,
  DRIVER_OFFER_REJECTED_MESSAGE,
  DRIVER_OFFERS_LOADED_MESSAGE,
  DRIVER_PROFILE_CREATED_MESSAGE,
  DRIVER_PROFILE_LOADED_MESSAGE,
  RIDE_COMPLETED_MESSAGE,
  RIDE_STARTED_MESSAGE,
  VEHICLE_CREATED_MESSAGE,
} from './driver.constant.js';
import {
  availability_schema,
  driver_profile_schema,
  location_schema,
  vehicle_schema,
} from './driver.type.js';
@Controller()
export class DriverController {
  constructor(private readonly driverService: DriverService) {}
  readonly current_user_id = (request: Request): string => {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    return request.auth.user_id;
  };

  @Get(DRIVER_ROUTES.PROFILE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async profile(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.get_driver_profile(
        this.current_user_id(request),
      ),
      DRIVER_PROFILE_LOADED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.CREATE_PROFILE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async create_profile(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.submit_driver_profile(
        this.current_user_id(request),
        driver_profile_schema.parse(request.body),
      ),
      DRIVER_PROFILE_CREATED_MESSAGE,
      201,
    );
  }

  @Patch(DRIVER_ROUTES.AVAILABILITY)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async availability(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.update_driver_availability(
        this.current_user_id(request),
        availability_schema.parse(request.body),
      ),
      DRIVER_AVAILABILITY_UPDATED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.VEHICLE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async vehicle(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.submit_vehicle(
        this.current_user_id(request),
        vehicle_schema.parse(request.body),
      ),
      VEHICLE_CREATED_MESSAGE,
      201,
    );
  }

  @Patch(DRIVER_ROUTES.CHANGE_CATEGORY)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async change_category(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = vehicle_category_selection_schema.parse(request.body);
    return send_success(
      response,
      await this.driverService.update_driver_vehicle_category(
        this.current_user_id(request),
        request.params.id as string,
        input.vehicle_category_id,
      ),
      VEHICLE_CATEGORY_UPDATED_MESSAGE,
    );
  }

  @Patch(DRIVER_ROUTES.ACTIVE_VEHICLE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async active_vehicle(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.update_active_vehicle(
        this.current_user_id(request),
        request.params.id as string,
      ),
      ACTIVE_VEHICLE_UPDATED_MESSAGE,
    );
  }

  @Get(DRIVER_ROUTES.OFFERS)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async offers(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.get_driver_offers(this.current_user_id(request)),
      DRIVER_OFFERS_LOADED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.ACCEPT)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async accept(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      {
        ride_id: await this.driverService.accept_driver_offer(
          this.current_user_id(request),
          request.params.id as string,
        ),
      },
      DRIVER_OFFER_ACCEPTED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.REJECT)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async reject(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.driverService.reject_driver_offer(
      this.current_user_id(request),
      request.params.id as string,
    );
    return send_success(response, null, DRIVER_OFFER_REJECTED_MESSAGE);
  }

  @Post(DRIVER_ROUTES.LOCATION)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async location(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.update_driver_location(
        this.current_user_id(request),
        location_schema.parse(request.body),
      ),
      DRIVER_LOCATION_UPDATED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.ARRIVE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async arrive(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.transition_driver_ride(
        this.current_user_id(request),
        request.params.id as string,
        'DRIVER_WAITING',
      ),
      DRIVER_ARRIVED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.START)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async start(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.transition_driver_ride(
        this.current_user_id(request),
        request.params.id as string,
        'IN_PROGRESS',
      ),
      RIDE_STARTED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.COMPLETE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async complete(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.transition_driver_ride(
        this.current_user_id(request),
        request.params.id as string,
        'COMPLETED',
      ),
      RIDE_COMPLETED_MESSAGE,
    );
  }
}
