import {
  Controller,
  HttpCode,
  Req,
  Res,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { ADMIN_ROUTES } from './admin.route.js';
import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import {
  DRIVER_VERIFICATION_UPDATED_MESSAGE,
  RIDE_OFFER_CREATED_MESSAGE,
} from './admin.constant.js';
import { offer_schema, verification_schema } from './admin.type.js';
@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}
  readonly current_user_id = (request: Request): string => {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    return request.auth.user_id;
  };

  @Patch(ADMIN_ROUTES.VERIFICATION)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async verification(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.adminService.verify_driver(
        this.current_user_id(request),
        request.params.id as string,
        verification_schema.parse(request.body),
      ),
      DRIVER_VERIFICATION_UPDATED_MESSAGE,
    );
  }

  @Post(ADMIN_ROUTES.OFFER)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async offer(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.adminService.dispatch_ride_offer(
        this.current_user_id(request),
        request.params.id as string,
        offer_schema.parse(request.body),
      ),
      RIDE_OFFER_CREATED_MESSAGE,
      201,
    );
  }
}
