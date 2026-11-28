import type { output as ZodOutput } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Res,
  UseGuards,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, AdminGuard, DriverAccessGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { VehicleVerificationService } from './vehicle_verification.service.js';
import {
  vehicle_asset,
  vehicle_id,
  vehicle_review,
  vehicle_submission,
} from './vehicle_verification.type.js';
import { catalog_query } from '../vehicle_catalog/vehicle_catalog.type.js';
import { z } from 'zod';
import { vehicle_document_keys } from './vehicle_verification.type.js';

const renewal_body_schema = z
  .object({
    expected_version: z.number().int().positive(),
    field_key: z.enum(vehicle_document_keys),
    asset_id: vehicle_id,
  })
  .strict();

@Controller()
export class VehicleVerificationController {
  constructor(private readonly service: VehicleVerificationService) {}
  @Post('driver/vehicle-verification/:id/renewal')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async renewal(
    @Body(new ZodValidationPipe(renewal_body_schema))
    validatedInput: ZodOutput<typeof renewal_body_schema>,
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(vehicle_id))
    routeId: ZodOutput<typeof vehicle_id>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validatedInput;
    return send_success(
      res,
      await this.service.renew(actorId, routeId, input),
      'Document replacement submitted for review',
    );
  }
  @Get('driver/vehicle-documents')
  @UseGuards(AuthGuard)
  async documents(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.list(actorId),
      'Your vehicle documents loaded',
    );
  }
  @Get('driver/vehicle-verification')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async mine(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.mine(actorId),
      'Vehicles loaded',
    );
  }
  @Get('driver/vehicle-verification/catalog')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async catalog(
    @CurrentUserId() actorId: string,
    @Query(new ZodValidationPipe(catalog_query))
    filters: ZodOutput<typeof catalog_query>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.catalog(actorId, filters),
      'Vehicle choices loaded',
    );
  }
  @Post('driver/vehicle-verification/assets')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async upload(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(vehicle_asset))
    input: ZodOutput<typeof vehicle_asset>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.upload(actorId, input),
      'Vehicle image saved',
    );
  }
  @Post('driver/vehicle-verification')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async submit(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(vehicle_submission))
    input: ZodOutput<typeof vehicle_submission>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.submit(actorId, input),
      'Vehicle submitted for review',
    );
  }
  @Delete('driver/vehicle-verification/assets/:id')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async discard(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(vehicle_id))
    routeId: ZodOutput<typeof vehicle_id>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.discard_upload(actorId, routeId),
      'Unused vehicle image discarded',
    );
  }
  @Patch('driver/vehicle-verification/:id')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async correct(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(vehicle_submission))
    input: ZodOutput<typeof vehicle_submission>,
    @Param('id', new ZodValidationPipe(vehicle_id))
    routeId: ZodOutput<typeof vehicle_id>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.submit(actorId, input, routeId),
      'Vehicle corrections submitted',
    );
  }
  @Delete('driver/vehicle-verification/:id')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async remove(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(vehicle_id))
    routeId: ZodOutput<typeof vehicle_id>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.remove(actorId, routeId),
      'Vehicle removed from your available vehicles',
    );
  }
  @Get('vehicle-verification/assets/:id')
  @UseGuards(AuthGuard)
  async asset(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(vehicle_id))
    routeId: ZodOutput<typeof vehicle_id>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.asset(actorId, routeId),
      'Vehicle attachment loaded',
    );
  }
  @Get('admin/users/:id/vehicle-verification')
  @UseGuards(AuthGuard, AdminGuard)
  async list(
    @Param('id', new ZodValidationPipe(vehicle_id))
    routeId: ZodOutput<typeof vehicle_id>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.list(routeId),
      'User vehicles loaded',
    );
  }
  @Patch('admin/users/:id/vehicle-verification/:vehicle_id/review')
  @UseGuards(AuthGuard, AdminGuard)
  async review(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(vehicle_id))
    routeId: ZodOutput<typeof vehicle_id>,
    @Param('vehicle_id', new ZodValidationPipe(vehicle_id))
    vehicleId: ZodOutput<typeof vehicle_id>,
    @Body(new ZodValidationPipe(vehicle_review))
    input: ZodOutput<typeof vehicle_review>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.review(actorId, routeId, vehicleId, input),
      'Vehicle field reviewed',
    );
  }
}
