import {
  Controller,
  Get,
  Post,
  Delete,
  HttpCode,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { AdminAccessService } from './admin_access.service.js';
import { ADMIN_ACCESS_ROUTES } from './admin_access.route.js';
import { ADMIN_ACCESS_MESSAGES } from './admin_access.constant.js';
import {
  access_list_schema,
  access_user_id_schema,
  grant_access_schema,
  revoke_access_schema,
} from './admin_access.type.js';

@Controller()
export class AdminAccessController {
  constructor(private readonly adminAccessService: AdminAccessService) {}
  @Get(ADMIN_ACCESS_ROUTES.LIST)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.adminAccessService.list_access(
        access_list_schema.parse(request.query),
      ),
      ADMIN_ACCESS_MESSAGES.LOADED,
    );
  }
  @Post(ADMIN_ACCESS_ROUTES.GRANT)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async grant(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.adminAccessService.grant_access(
        request.auth!.user_id,
        grant_access_schema.parse(request.body),
      ),
      ADMIN_ACCESS_MESSAGES.GRANTED,
    );
  }
  @Delete(ADMIN_ACCESS_ROUTES.REVOKE)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async revoke(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.adminAccessService.revoke_access(
        request.auth!.user_id,
        access_user_id_schema.parse(request.params.id),
        revoke_access_schema.parse(request.body),
      ),
      ADMIN_ACCESS_MESSAGES.REVOKED,
    );
  }
}
