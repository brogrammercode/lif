import {
  Controller,
  HttpCode,
  Req,
  Res,
  Post,
  Get,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthGuard } from '../../core/guards.js';
import { AUTH_ROUTES } from './auth.route.js';
import type { Request, Response } from 'express';
import { send_success } from '../../core/response.js';
import { AppError } from '../../core/error.js';
import {
  LOGIN_SUCCESS_MESSAGE,
  LOGOUT_SUCCESS_MESSAGE,
  REFRESH_SUCCESS_MESSAGE,
} from './auth.constant.js';
import { external_login_schema, refresh_schema } from './auth.type.js';
import { verify_google_identity } from './auth.security.js';
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  readonly request_data = (request: Request) => ({
    user_agent: request.header('user-agent'),
    ip_address: request.ip,
  });

  @Post(AUTH_ROUTES.GOOGLE_LOGIN)
  @HttpCode(200)
  async google_login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = external_login_schema.parse(request.body);
    const identity = await verify_google_identity(input.id_token);
    const result = await this.authService.login_with_provider(
      'GOOGLE',
      identity,
      this.request_data(request),
    );
    if (result.user.role === 'ADMIN' && typeof result.user.id === 'string')
      request.admin_actor_id = result.user.id;
    return send_success(response, result, LOGIN_SUCCESS_MESSAGE);
  }

  @Post(AUTH_ROUTES.REFRESH)
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = refresh_schema.parse(request.body);
    const result = await this.authService.refresh_session(
      input.refresh_token,
      this.request_data(request),
    );
    if (result.user.role === 'ADMIN' && typeof result.user.id === 'string')
      request.admin_actor_id = result.user.id;
    return send_success(response, result, REFRESH_SUCCESS_MESSAGE);
  }

  @Get(AUTH_ROUTES.CURRENT_USER)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async current_user(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!request.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    }
    return send_success(
      response,
      await this.authService.get_current_user(request.auth.user_id),
      'Current user loaded',
    );
  }

  @Post(AUTH_ROUTES.REVOKE)
  @HttpCode(200)
  async revoke(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = refresh_schema.parse(request.body);
    await this.authService.logout(input.refresh_token);
    return send_success(response, null, LOGOUT_SUCCESS_MESSAGE);
  }
}
