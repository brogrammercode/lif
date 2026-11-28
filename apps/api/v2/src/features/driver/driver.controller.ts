import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import type { output as ZodOutput } from 'zod';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { DriverOperationsService } from '../driver_operations/driver_operations.service.js';
import { trip_code_input } from '../driver_operations/dto/driver-operations.dto.js';
import {
  Controller,
  Body,
  HttpCode,
  Res,
  Get,
  Post,
  Patch,
  UseGuards,
  Param,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { DriverService } from './driver.service.js';
import { AuthGuard, DriverAccessGuard } from '../../core/guards.js';
import { DRIVER_ROUTES } from './driver.route.js';
import type { Response } from 'express';
import { vehicle_category_selection_schema } from './dto/driver.dto.js';
import {
  VEHICLE_CATEGORY_UPDATED_MESSAGE,
  ACTIVE_VEHICLE_UPDATED_MESSAGE,
} from './driver.constant.js';
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
  type DriverProfileInput,
  type LocationInput,
  type VehicleInput,
  type VehicleCategorySelectionInput,
  type AvailabilityInput,
} from './dto/driver.dto.js';
@Controller()
export class DriverController {
  constructor(
    private readonly driverService: DriverService,
    private readonly operations: DriverOperationsService,
  ) {}

  @Get(DRIVER_ROUTES.PROFILE)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async profile(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.get_driver_profile(actorId),
      DRIVER_PROFILE_LOADED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.CREATE_PROFILE)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async create_profile(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(driver_profile_schema))
    input: DriverProfileInput,
  ) {
    return send_success(
      response,
      await this.driverService.submit_driver_profile(actorId, input),
      DRIVER_PROFILE_CREATED_MESSAGE,
      201,
    );
  }

  @Patch(DRIVER_ROUTES.AVAILABILITY)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async availability(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(availability_schema)) input: AvailabilityInput,
  ) {
    return send_success(
      response,
      await this.driverService.update_driver_availability(actorId, input),
      DRIVER_AVAILABILITY_UPDATED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.VEHICLE)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async vehicle(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(vehicle_schema)) input: VehicleInput,
  ) {
    return send_success(
      response,
      await this.driverService.submit_vehicle(actorId, input),
      VEHICLE_CREATED_MESSAGE,
      201,
    );
  }

  @Patch(DRIVER_ROUTES.CHANGE_CATEGORY)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async change_category(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) routeId: string,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(vehicle_category_selection_schema))
    input: VehicleCategorySelectionInput,
  ) {
    return send_success(
      response,
      await this.driverService.update_driver_vehicle_category(
        actorId,
        routeId as string,
        input.vehicle_category_id,
      ),
      VEHICLE_CATEGORY_UPDATED_MESSAGE,
    );
  }

  @Patch(DRIVER_ROUTES.ACTIVE_VEHICLE)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async active_vehicle(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) routeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.update_active_vehicle(
        actorId,
        routeId as string,
      ),
      ACTIVE_VEHICLE_UPDATED_MESSAGE,
    );
  }

  @Get(DRIVER_ROUTES.OFFERS)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async offers(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.driverService.get_driver_offers(actorId),
      DRIVER_OFFERS_LOADED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.ACCEPT)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async accept(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) routeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      {
        ride_id: await this.driverService.accept_driver_offer(
          actorId,
          routeId as string,
        ),
      },
      DRIVER_OFFER_ACCEPTED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.REJECT)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async reject(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) routeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.driverService.reject_driver_offer(actorId, routeId as string);
    return send_success(response, null, DRIVER_OFFER_REJECTED_MESSAGE);
  }

  @Post(DRIVER_ROUTES.LOCATION)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async location(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(location_schema)) input: LocationInput,
  ) {
    return send_success(
      response,
      await this.driverService.update_driver_location(actorId, input),
      DRIVER_LOCATION_UPDATED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.ARRIVE)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async arrive(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) routeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.operations.arrive(actorId, routeId as string),
      DRIVER_ARRIVED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.START)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async start(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) routeId: string,
    @Body(new ZodValidationPipe(trip_code_input))
    input: ZodOutput<typeof trip_code_input>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.operations.start_proof(actorId, routeId as string, input.code),
      RIDE_STARTED_MESSAGE,
    );
  }

  @Post(DRIVER_ROUTES.COMPLETE)
  @HttpCode(200)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async complete(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) routeId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.operations.complete(actorId, routeId as string),
      RIDE_COMPLETED_MESSAGE,
    );
  }
}
