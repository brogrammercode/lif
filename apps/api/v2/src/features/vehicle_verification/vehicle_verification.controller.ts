import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
@Controller()
export class VehicleVerificationController {
  constructor(private readonly service: VehicleVerificationService) {}
  @Get('driver/vehicle-verification')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async mine(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.service.mine(req.auth!.user_id),
      'Vehicles loaded',
    );
  }
  @Get('driver/vehicle-verification/catalog')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async catalog(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.catalog(
        req.auth!.user_id,
        catalog_query.parse(req.query),
      ),
      'Vehicle choices loaded',
    );
  }
  @Post('driver/vehicle-verification/assets')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async upload(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.service.upload(
        req.auth!.user_id,
        vehicle_asset.parse(req.body),
      ),
      'Vehicle image saved',
    );
  }
  @Post('driver/vehicle-verification')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async submit(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.service.submit(
        req.auth!.user_id,
        vehicle_submission.parse(req.body),
      ),
      'Vehicle submitted for review',
    );
  }
  @Delete('driver/vehicle-verification/assets/:id')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async discard(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.discard_upload(
        req.auth!.user_id,
        vehicle_id.parse(req.params.id),
      ),
      'Unused vehicle image discarded',
    );
  }
  @Patch('driver/vehicle-verification/:id')
  @UseGuards(AuthGuard, DriverAccessGuard)
  async correct(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.submit(
        req.auth!.user_id,
        vehicle_submission.parse(req.body),
        vehicle_id.parse(req.params.id),
      ),
      'Vehicle corrections submitted',
    );
  }
  @Get('vehicle-verification/assets/:id')
  @UseGuards(AuthGuard)
  async asset(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.service.asset(
        req.auth!.user_id,
        vehicle_id.parse(req.params.id),
      ),
      'Vehicle attachment loaded',
    );
  }
  @Get('admin/users/:id/vehicle-verification')
  @UseGuards(AuthGuard, AdminGuard)
  async list(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.service.list(vehicle_id.parse(req.params.id)),
      'User vehicles loaded',
    );
  }
  @Patch('admin/users/:id/vehicle-verification/:vehicle_id/review')
  @UseGuards(AuthGuard, AdminGuard)
  async review(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.service.review(
        req.auth!.user_id,
        vehicle_id.parse(req.params.id),
        vehicle_id.parse(req.params.vehicle_id),
        vehicle_review.parse(req.body),
      ),
      'Vehicle field reviewed',
    );
  }
}
