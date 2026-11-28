import { RouteBody } from '../../common/decorators/route-body.decorator.js';
import type { output as ZodOutput } from 'zod';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  Controller,
  Body,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { user_id_schema } from '../admin_user/admin_user.type.js';
import { WalletLedgerRepository } from './wallet-ledger.repository.js';
import { WalletRideRepository } from './wallet-ride.repository.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { start_topup, WalletTopUps } from './wallet-topups.js';
import { RideUpi } from './ride-upi.js';
import { check_topup_request, query_schema } from './dto/wallet.dto.js';

@Controller()
@UseGuards(AuthGuard)
export class WalletController {
  constructor(
    private readonly ledger: WalletLedgerRepository,
    private readonly walletRides: WalletRideRepository,
    private readonly topups: WalletTopUps,
    private readonly ride_upi: RideUpi,
  ) {}

  @Get('wallet/topups')
  async list_topups(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.topups.list(actorId),
      'Wallet top-ups loaded',
    );
  }

  @Post('wallet/topups')
  @HttpCode(200)
  async start_topup(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(start_topup))
    body: ZodOutput<typeof start_topup>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.topups.start(actorId, body),
      'Top-up checkout loaded',
    );
  }

  @Post('wallet/topups/:id/check')
  @HttpCode(200)
  async check_topup(
    @CurrentUserId() actorId: string,
    @RouteBody('id', new ZodValidationPipe(check_topup_request))
    input: ZodOutput<typeof check_topup_request>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.topups.check(actorId, input.id, input.cancelled === true),
      'Top-up status loaded',
    );
  }

  @Get('wallet')
  async view(
    @CurrentUserId() actorId: string,
    @Query(new ZodValidationPipe(query_schema))
    query: ZodOutput<typeof query_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { kind, page, page_size } = query;
    const user_id = actorId;
    if (kind === 'DRIVER') await this.ledger.requireDriverAccess(user_id);
    return send_success(
      response,
      await this.ledger.view(user_id, kind, page, page_size),
      'Wallet loaded',
    );
  }

  @Post('rides/:id/payments/wallet')
  @HttpCode(200)
  async pay_ride(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.walletRides.pay_ride(actorId, id),
      'Ride paid from Wallet',
    );
  }

  @Post('rides/:id/payments/upi')
  @HttpCode(200)
  async upi_checkout(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.ride_upi.checkout(actorId, id),
      'UPI checkout loaded',
    );
  }

  @Post('rides/:id/payments/upi/check')
  @HttpCode(200)
  async upi_status(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.ride_upi.check(actorId, id),
      'UPI payment status loaded',
    );
  }
}
