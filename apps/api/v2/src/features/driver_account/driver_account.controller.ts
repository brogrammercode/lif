import {
  Controller,
  Get,
  Post,
  Patch,
  UseGuards,
  Req,
  Res,
  Param,
  Query,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { DriverAccountService } from './driver_account.service.js';
import {
  finance_query,
  payout_request,
  payout_review,
} from './driver_account.type.js';
import { catalog_id } from '../vehicle_catalog/vehicle_catalog.type.js';
@Controller()
@UseGuards(AuthGuard)
export class DriverAccountController {
  constructor(private readonly service: DriverAccountService) {}
  @Get('driver/account') account(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service
      .account(req.auth!.user_id)
      .then((v) => send_success(res, v, 'Driver account loaded'));
  }
  @Get('driver/finances') finance(
    @Req() req: Request,
    @Query() q: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service
      .finance(req.auth!.user_id, finance_query.parse(q))
      .then((v) => send_success(res, v, 'Driver statement loaded'));
  }
  @Post('driver/payout-changes') request(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service
      .request(req.auth!.user_id, payout_request.parse(req.body))
      .then((v) => send_success(res, v, 'Account change submitted'));
  }
  @Get('admin/users/:id/driver-account')
  @UseGuards(AdminGuard)
  admin_account(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service
      .account(catalog_id.parse(id))
      .then((v) => send_success(res, v, 'Driver account loaded'));
  }
  @Get('admin/users/:id/driver-finances')
  @UseGuards(AdminGuard)
  admin_finance(
    @Param('id') id: string,
    @Query() q: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service
      .finance(catalog_id.parse(id), finance_query.parse(q))
      .then((v) => send_success(res, v, 'Driver statement loaded'));
  }
  @Get('admin/payout-changes/:id/private')
  @UseGuards(AdminGuard)
  reveal(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service
      .reveal(req.auth!.user_id, catalog_id.parse(id))
      .then((v) => send_success(res, v, 'Private account details loaded'));
  }
  @Patch('admin/payout-changes/:id')
  @UseGuards(AdminGuard)
  review(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service
      .review(
        req.auth!.user_id,
        catalog_id.parse(id),
        payout_review.parse(req.body),
      )
      .then((v) => send_success(res, v, 'Account change reviewed'));
  }
}
