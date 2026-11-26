import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WalletTopUps } from './wallet-topups.js';

@Controller('wallet/webhooks')
export class WalletWebhookController {
  constructor(private readonly topups: WalletTopUps) {}

  @Post('razorpay')
  @HttpCode(200)
  async receive(
    @Req() request: Request,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') event_id?: string,
  ) {
    await this.topups.webhook(request.raw_body, signature, event_id);
    return { status: 'success', data: null, message: 'Payment event accepted' };
  }
}
