import {
  Controller,
  HttpCode,
  Req,
  Res,
  Get,
  Post,
  Delete,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { AuthGuard, PaymentWebhookGuard } from '../../core/guards.js';
import { IdempotencyInterceptor } from '../../core/idempotency.interceptor.js';
import { PAYMENT_ROUTES } from './payment.route.js';
import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import {
  PAYMENT_CHECKOUT_CREATED_MESSAGE,
  PAYMENT_METHOD_CREATED_MESSAGE,
  PAYMENT_METHOD_DELETED_MESSAGE,
  PAYMENT_METHODS_LOADED_MESSAGE,
  PAYMENT_WEBHOOK_PROCESSED_MESSAGE,
  RECEIPT_LOADED_MESSAGE,
} from './payment.constant.js';
import {
  checkout_schema,
  payment_method_schema,
  webhook_schema,
} from './payment.type.js';
@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}
  readonly current_user_id = (request: Request): string => {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    return request.auth.user_id;
  };

  @Get(PAYMENT_ROUTES.LIST)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.paymentService.get_payment_methods(
        this.current_user_id(request),
      ),
      PAYMENT_METHODS_LOADED_MESSAGE,
    );
  }

  @Post(PAYMENT_ROUTES.CREATE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.paymentService.add_payment_method(
        this.current_user_id(request),
        payment_method_schema.parse(request.body),
      ),
      PAYMENT_METHOD_CREATED_MESSAGE,
      201,
    );
  }

  @Delete(PAYMENT_ROUTES.REMOVE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async remove(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.paymentService.remove_payment_method(
      this.current_user_id(request),
      request.params.id as string,
    );
    return send_success(response, null, PAYMENT_METHOD_DELETED_MESSAGE);
  }

  @Post(PAYMENT_ROUTES.CHECKOUT)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async checkout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.paymentService.create_payment_checkout(
        this.current_user_id(request),
        checkout_schema.parse({
          ...request.body,
          ride_id: request.params.id ?? request.body?.ride_id,
        }),
      ),
      PAYMENT_CHECKOUT_CREATED_MESSAGE,
      201,
    );
  }

  @Post(PAYMENT_ROUTES.WEBHOOK)
  @HttpCode(200)
  @UseGuards(PaymentWebhookGuard)
  async webhook(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.paymentService.process_payment_webhook(
        request.params.provider as string,
        webhook_schema.parse(request.body),
      ),
      PAYMENT_WEBHOOK_PROCESSED_MESSAGE,
    );
  }

  @Get(PAYMENT_ROUTES.RECEIPT)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async receipt(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.paymentService.load_receipt(
        this.current_user_id(request),
        request.params.id as string,
      ),
      RECEIPT_LOADED_MESSAGE,
    );
  }
}
