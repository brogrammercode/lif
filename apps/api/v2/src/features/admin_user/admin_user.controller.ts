import {
  Controller,
  HttpCode,
  Req,
  Res,
  Get,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { AdminUserRepository } from './admin_user.repo.js';
import { schedule_new_user_emails } from '../../infra/mail/new_user_email.js';
import { AdminUserService } from './admin_user.service.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { ADMIN_USER_ROUTES } from './admin_user.route.js';
import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { ADMIN_USER_MESSAGES } from './admin_user.constant.js';
import { z } from 'zod';
import { rides_query } from './admin_user.rides.js';
import {
  personal_update_schema,
  user_id_schema,
  user_list_schema,
} from './admin_user.type.js';
@Controller()
export class AdminUserController {
  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly adminUserService: AdminUserService,
  ) {}
  @Get('admin/users/:id/rides')
  @UseGuards(AuthGuard, AdminGuard)
  async rides(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return send_success(
      response,
      await this.adminUserRepository.rides(
        user_id_schema.parse(request.params.id),
        rides_query.parse(request.query),
      ),
      'User rides retrieved',
    );
  }
  @Delete(ADMIN_USER_ROUTES.DETAIL)
  @UseGuards(AuthGuard, AdminGuard)
  async deactivate(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = z
      .object({
        expected_updated_at: z.iso.datetime(),
        confirmation: z.string().trim().min(1).max(254),
      })
      .strict()
      .parse(request.body);
    return send_success(
      response,
      await this.adminUserRepository.deactivate_user(
        request.auth!.user_id,
        user_id_schema.parse(request.params.id),
        input,
      ),
      'User deactivated; history retained',
    );
  }
  @Get(ADMIN_USER_ROUTES.LIST)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    schedule_new_user_emails();
    return send_success(
      response,
      await this.adminUserRepository.list_admin_users(
        user_list_schema.parse(request.query),
      ),
      'Users retrieved',
    );
  }

  @Get(ADMIN_USER_ROUTES.DETAIL)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async detail(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.adminUserService.get_personal_details(
        user_id_schema.parse(request.params.id),
      ),
      'Personal details retrieved',
    );
  }

  @Patch(ADMIN_USER_ROUTES.UPDATE)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async update(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    return send_success(
      response,
      await this.adminUserService.save_personal_details(
        request.auth.user_id,
        user_id_schema.parse(request.params.id),
        personal_update_schema.parse(request.body),
      ),
      ADMIN_USER_MESSAGES.UPDATED,
    );
  }
}
