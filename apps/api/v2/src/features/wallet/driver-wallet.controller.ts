import type { output as ZodOutput } from 'zod';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  Controller,
  Body,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { user_id_schema } from '../admin_user/admin_user.type.js';
import { WalletRepository } from './wallet.repo.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { payout_method_input, PayoutMethods } from './payout-methods.js';
import { pagination } from './dto/wallet.dto.js';

@Controller('driver/wallet')
@UseGuards(AuthGuard)
export class DriverWalletController {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly payout_methods: PayoutMethods,
  ) {}

  @Get('payout-methods')
  async payout_methods_list(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_methods.list(actorId),
      'Payout methods loaded',
    );
  }

  @Get('payouts')
  async driver_payouts(
    @CurrentUserId() actorId: string,
    @Query(new ZodValidationPipe(pagination))
    query: ZodOutput<typeof pagination>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = query;
    return send_success(
      response,
      await this.wallets.driver_payouts(actorId, page, page_size),
      'Driver payouts loaded',
    );
  }

  @Get('payouts/:id')
  async driver_payout(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.wallets.driver_payout(actorId, id),
      'Payout loaded',
    );
  }

  @Post('payout-methods')
  @HttpCode(200)
  async payout_method_setup(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(payout_method_input))
    body: ZodOutput<typeof payout_method_input>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_methods.setup(actorId, body),
      'Payout account saved',
    );
  }

  @Patch('payout-methods/:id/default')
  async payout_method_default(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_methods.set_default(actorId, id),
      'Payout account selected',
    );
  }

  @Post('payout-methods/:id/check')
  @HttpCode(200)
  async payout_method_check(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_methods.check(actorId, id),
      'Payout method checked',
    );
  }
}
