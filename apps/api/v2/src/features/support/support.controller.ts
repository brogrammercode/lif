import {
  Controller,
  HttpCode,
  Req,
  Res,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SupportService } from './support.service.js';
import { AuthGuard } from '../../core/guards.js';
import { IdempotencyInterceptor } from '../../core/idempotency.interceptor.js';
import { SUPPORT_ROUTES } from './support.route.js';
import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import {
  MESSAGE_CREATED_MESSAGE,
  TICKET_CREATED_MESSAGE,
  TICKET_LOADED_MESSAGE,
  TICKETS_LOADED_MESSAGE,
} from './support.constant.js';
import { message_schema, ticket_schema } from './support.type.js';
@Controller()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}
  readonly current_user_id = (request: Request): string => {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    return request.auth.user_id;
  };

  @Get(SUPPORT_ROUTES.LIST)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.supportService.get_support_tickets(
        this.current_user_id(request),
      ),
      TICKETS_LOADED_MESSAGE,
    );
  }

  @Get(SUPPORT_ROUTES.DETAIL)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async detail(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.supportService.get_support_ticket(
        this.current_user_id(request),
        request.params.id as string,
      ),
      TICKET_LOADED_MESSAGE,
    );
  }

  @Post(SUPPORT_ROUTES.CREATE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.supportService.open_support_ticket(
        this.current_user_id(request),
        ticket_schema.parse(request.body),
      ),
      TICKET_CREATED_MESSAGE,
      201,
    );
  }

  @Post(SUPPORT_ROUTES.MESSAGE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async message(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.supportService.add_support_message(
        this.current_user_id(request),
        request.params.id as string,
        message_schema.parse(request.body),
      ),
      MESSAGE_CREATED_MESSAGE,
      201,
    );
  }
}
