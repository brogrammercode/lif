import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import { RouteBody } from '../../common/decorators/route-body.decorator.js';
import {
  Body,
  Controller,
  HttpCode,
  Param,
  Get,
  Post,
  Delete,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PaymentService } from './payment.service.js';
import { AuthGuard, PaymentWebhookGuard } from '../../core/guards.js';
import { IdempotencyInterceptor } from '../../core/idempotency.interceptor.js';
import { PAYMENT_ROUTES } from './payment.route.js';
import { success } from '../../core/response.js';
import {
  PAYMENT_CHECKOUT_CREATED_MESSAGE,
  PAYMENT_METHOD_CREATED_MESSAGE,
  PAYMENT_METHOD_DELETED_MESSAGE,
  PAYMENT_METHODS_LOADED_MESSAGE,
  PAYMENT_WEBHOOK_PROCESSED_MESSAGE,
  RECEIPT_LOADED_MESSAGE,
} from './payment.constant.js';
import {
  checkout_request,
  type CheckoutInput,
  payment_method_schema,
  webhook_schema,
  type PaymentMethodInput,
  type WebhookInput,
} from './payment.type.js';
@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get(PAYMENT_ROUTES.LIST)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async list(@CurrentUserId() user: string) {
    return success(
      await this.paymentService.get_payment_methods(user),
      PAYMENT_METHODS_LOADED_MESSAGE,
    );
  }

  @Post(PAYMENT_ROUTES.CREATE)
  @HttpCode(201)
  @UseGuards(AuthGuard)
  async create(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(payment_method_schema))
    input: PaymentMethodInput,
  ) {
    return success(
      await this.paymentService.add_payment_method(user, input),
      PAYMENT_METHOD_CREATED_MESSAGE,
    );
  }

  @Delete(PAYMENT_ROUTES.REMOVE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async remove(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    await this.paymentService.remove_payment_method(user, id);
    return success(null, PAYMENT_METHOD_DELETED_MESSAGE);
  }

  @Post(PAYMENT_ROUTES.CHECKOUT)
  @HttpCode(201)
  @UseGuards(AuthGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async checkout(
    @CurrentUserId() user: string,
    @RouteBody('id', new ZodValidationPipe(checkout_request))
    input: CheckoutInput,
  ) {
    return success(
      await this.paymentService.create_payment_checkout(user, input),
      PAYMENT_CHECKOUT_CREATED_MESSAGE,
    );
  }

  @Post(PAYMENT_ROUTES.WEBHOOK)
  @HttpCode(200)
  @UseGuards(PaymentWebhookGuard)
  async webhook(
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(webhook_schema)) input: WebhookInput,
  ) {
    return success(
      await this.paymentService.process_payment_webhook(provider, input),
      PAYMENT_WEBHOOK_PROCESSED_MESSAGE,
    );
  }

  @Get(PAYMENT_ROUTES.RECEIPT)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async receipt(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    return success(
      await this.paymentService.load_receipt(user, id),
      RECEIPT_LOADED_MESSAGE,
    );
  }
}
