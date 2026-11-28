import {
  Body,
  Controller,
  HttpCode,
  Req,
  Res,
  Post,
  Get,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { z } from 'zod';
import { AdminAuthService } from './admin_auth.service.js';
import {
  AdminOriginGuard,
  AdminSignInGuard,
  AuthGuard,
  AdminGuard,
} from '../../core/guards.js';
import type { CookieOptions, Request, Response } from 'express';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { admin_login_schema } from './dto/admin-auth.dto.js';
import {
  ADMIN_AUTH_MESSAGES,
  ADMIN_COOKIE,
  ADMIN_COOKIE_PATH,
} from './admin_auth.constant.js';
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}
  readonly cookie_options: CookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: ADMIN_COOKIE_PATH,
  };

  readonly refresh_cookie = (request: Request) => {
    const cookie = request.headers.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${ADMIN_COOKIE}=`));
    return cookie?.slice(ADMIN_COOKIE.length + 1) ?? '';
  };

  readonly request_data = (request: Request) => ({
    user_agent: request.header('user-agent'),
    ip_address: request.ip,
  });

  readonly browser_response = (
    response: Response,
    session: Awaited<ReturnType<AdminAuthService['login_admin']>>,
    message: string,
  ) => {
    response.cookie(ADMIN_COOKIE, session.refresh_token, {
      ...this.cookie_options,
      expires: session.expires_at,
    });
    response.setHeader('Cache-Control', 'no-store');
    return send_success(
      response,
      { access_token: session.access_token, user: session.user },
      message,
    );
  };

  @Post('google')
  @HttpCode(200)
  @UseGuards(AdminOriginGuard, AdminSignInGuard)
  async google(
    @Body(new ZodValidationPipe(admin_login_schema))
    input: z.output<typeof admin_login_schema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.adminAuthService.login_admin(input.id_token, {
      ...this.request_data(request),
      browser_location: input.browser_location,
    });
    request.admin_actor_id = session.user.id;
    return this.browser_response(
      response,
      session,
      ADMIN_AUTH_MESSAGES.SIGNED_IN,
    );
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(AdminOriginGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const token = this.refresh_cookie(request);
      if (!token)
        throw new AppError(401, 'INVALID_SESSION', ADMIN_AUTH_MESSAGES.EXPIRED);
      const session = await this.adminAuthService.refresh_admin(
        token,
        this.request_data(request),
      );
      request.admin_actor_id = session.user.id;
      return this.browser_response(
        response,
        session,
        ADMIN_AUTH_MESSAGES.RESTORED,
      );
    } catch (error) {
      if (error instanceof AppError && error.status_code === 401)
        response.clearCookie(ADMIN_COOKIE, this.cookie_options);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AdminOriginGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.refresh_cookie(request);
    if (token)
      request.admin_actor_id =
        (await this.adminAuthService.logout_admin(token)) ?? undefined;
    response.clearCookie(ADMIN_COOKIE, this.cookie_options);
    response.setHeader('Cache-Control', 'no-store');
    return send_success(response, null, ADMIN_AUTH_MESSAGES.SIGNED_OUT);
  }

  @Get('me')
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async me(
    @CurrentUserId() user: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return send_success(
      response,
      await this.adminAuthService.current_admin(user),
      ADMIN_AUTH_MESSAGES.PROFILE,
    );
  }
}
