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
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminGuard, AuthGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { user_id_schema } from '../admin_user/admin_user.type.js';
import { WalletRepository } from './wallet.repo.js';
import { WalletLedgerRepository } from './wallet-ledger.repository.js';
import { WalletRideRepository } from './wallet-ride.repository.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { payout_settings_schema } from './payout-schedule.js';
import { topup_reference, WalletTopUps } from './wallet-topups.js';
import { payout_edit, payout_block, PayoutAdmin } from './payout-admin.js';
import { PayoutTransfer } from './payout-transfer.js';
import {
  approve_cycle_body_schema,
  reconcile_payout_body_schema,
  reconcile_topup_body_schema,
  refund_ride_body_schema,
  pagination,
  ledger_query,
} from './dto/wallet.dto.js';

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminWalletController {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly ledger: WalletLedgerRepository,
    private readonly walletRides: WalletRideRepository,
    private readonly topups: WalletTopUps,
    private readonly payout_admin: PayoutAdmin,
    private readonly transfers: PayoutTransfer,
  ) {}

  @Post('payouts/cycles/:id/approve')
  @HttpCode(200)
  async approve_cycle(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Body(new ZodValidationPipe(approve_cycle_body_schema))
    body: ZodOutput<typeof approve_cycle_body_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { version } = body;
    return send_success(
      response,
      await this.transfers.approve(actorId, id, version),
      'Payout cycle approved',
    );
  }

  @Patch('payouts/drivers/:id')
  async edit_payout(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Body(new ZodValidationPipe(payout_edit))
    body: ZodOutput<typeof payout_edit>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_admin.edit(actorId, id, body),
      'Driver payout updated',
    );
  }

  @Get('payouts/blocks')
  async blocks(@Res({ passthrough: true }) response: Response) {
    return send_success(
      response,
      await this.payout_admin.blocks(),
      'Payout blocks loaded',
    );
  }

  @Put('payouts/blocks')
  async block(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(payout_block))
    body: ZodOutput<typeof payout_block>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_admin.block(actorId, body),
      'Payout block updated',
    );
  }

  @Get('payouts/settings')
  async schedule(@Res({ passthrough: true }) response: Response) {
    return send_success(
      response,
      await this.wallets.schedule(),
      'Payout settings loaded',
    );
  }

  @Put('payouts/settings')
  async save_schedule(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(payout_settings_schema))
    body: ZodOutput<typeof payout_settings_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.wallets.save_schedule(actorId, body),
      'Payout settings saved',
    );
  }

  @Get('payouts/cycles')
  async cycles(
    @Query(new ZodValidationPipe(pagination))
    query: ZodOutput<typeof pagination>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = query;
    return send_success(
      response,
      await this.wallets.cycles(page, page_size),
      'Payout cycles loaded',
    );
  }

  @Get('payouts/upcoming')
  async upcoming(
    @Query(new ZodValidationPipe(pagination))
    query: ZodOutput<typeof pagination>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = query;
    return send_success(
      response,
      await this.wallets.upcoming(page, page_size),
      'Upcoming payouts loaded',
    );
  }

  @Post('payouts/drivers/:id/reconcile')
  @HttpCode(200)
  async reconcile_payout(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Body(new ZodValidationPipe(reconcile_payout_body_schema))
    body: ZodOutput<typeof reconcile_payout_body_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = body;
    return send_success(
      response,
      await this.transfers.reconcile(actorId, id, input.provider_id),
      'Payout checked against RazorpayX',
    );
  }

  @Get('payouts/cycles/:id/report')
  async cycle_report(
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_admin.report(id),
      'Payout report loaded',
    );
  }

  @Get('payouts/cycles/:id/drivers')
  async cycle_drivers(
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Query(new ZodValidationPipe(pagination))
    query: ZodOutput<typeof pagination>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = query;
    return send_success(
      response,
      await this.wallets.cycle_drivers(id, page, page_size),
      'Payout drivers loaded',
    );
  }

  @Get('payouts/drivers/:id/lines')
  async payout_lines(
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Query(new ZodValidationPipe(pagination))
    query: ZodOutput<typeof pagination>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = query;
    return send_success(
      response,
      await this.wallets.payout_lines(id, page, page_size),
      'Payout breakdown loaded',
    );
  }

  @Get('users/:id/wallet-ledger')
  async user_ledger(
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Query(new ZodValidationPipe(ledger_query))
    query: z.infer<typeof ledger_query>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { kind, page, page_size, entry_kind, from, to, reference, timeline } =
      query;
    const end = to ? new Date(`${to}T00:00:00+05:30`) : undefined;
    if (end) end.setTime(end.getTime() + 86_400_000);
    const user_id = id;
    const start = from ? new Date(`${from}T00:00:00+05:30`) : undefined;
    if (timeline) {
      return send_success(
        response,
        await this.ledger.adminActivity(user_id, kind, page, page_size, {
          entry_kind,
          from: start,
          end,
          reference,
        }),
        'User wallet activity loaded',
      );
    }
    const [ledger, reviews] = await Promise.all([
      this.ledger.view(user_id, kind, page, page_size, {
        entry_kind,
        from: start,
        end,
        reference,
      }),
      kind === 'RIDER' ? this.topups.admin_reviews(user_id) : [],
    ]);
    return send_success(
      response,
      { ...ledger, reviews },
      'User wallet ledger loaded',
    );
  }

  @Post('users/:id/wallet-ledger/topups/:topup_id/reconcile')
  @HttpCode(200)
  async reconcile_topup(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Param('topup_id', new ZodValidationPipe(topup_reference))
    topup_id: ZodOutput<typeof topup_reference>,
    @Body(new ZodValidationPipe(reconcile_topup_body_schema))
    body: ZodOutput<typeof reconcile_topup_body_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { reason, dispute_id } = body;
    return send_success(
      response,
      await this.topups.admin_reconcile(
        actorId,
        id,
        topup_id,
        reason,
        dispute_id,
      ),
      'Top-up reconciled',
    );
  }

  @Post('users/:id/wallet-ledger/rides/:ride_id/refund')
  @HttpCode(200)
  async refund_ride(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(user_id_schema))
    id: ZodOutput<typeof user_id_schema>,
    @Param('ride_id', new ZodValidationPipe(user_id_schema))
    ride_id: ZodOutput<typeof user_id_schema>,
    @Body(new ZodValidationPipe(refund_ride_body_schema))
    body: ZodOutput<typeof refund_ride_body_schema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { reason, platform_funded } = body;
    return send_success(
      response,
      await this.walletRides.refund_ride(
        actorId,
        id,
        ride_id,
        reason,
        platform_funded,
      ),
      'Ride payment refunded',
    );
  }
}
