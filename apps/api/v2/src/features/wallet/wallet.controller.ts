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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WalletEntryKind } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../core/error.js';
import { AdminGuard, AuthGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { user_id_schema } from '../admin_user/admin_user.type.js';
import { WalletRepository } from './wallet.repo.js';
import { payout_settings_schema } from './payout-schedule.js';
import { start_topup, topup_reference, WalletTopUps } from './wallet-topups.js';
import { payout_edit, payout_block, PayoutAdmin } from './payout-admin.js';
import { payout_method_input, PayoutMethods } from './payout-methods.js';
import { PayoutTransfer } from './payout-transfer.js';
import { RideUpi } from './ride-upi.js';

const query_schema = z
  .object({
    kind: z.enum(['RIDER', 'DRIVER']).default('RIDER'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
const pagination = query_schema.omit({ kind: true });
const ledger_query = query_schema
  .extend({
    entry_kind: z.enum(WalletEntryKind).optional(),
    timeline: z.literal('true').optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    reference: user_id_schema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The end date must be on or after the start date.',
    path: ['to'],
  });
const reason_schema = z.string().trim().min(3).max(300);

@Controller()
@UseGuards(AuthGuard)
export class WalletController {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly topups: WalletTopUps,
    private readonly payout_admin: PayoutAdmin,
    private readonly payout_methods: PayoutMethods,
    private readonly transfers: PayoutTransfer,
    private readonly ride_upi: RideUpi,
  ) {}

  @Post('admin/payouts/cycles/:id/approve')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async approve_cycle(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { version } = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(body);
    return send_success(
      response,
      await this.transfers.approve(
        request.auth!.user_id,
        user_id_schema.parse(id),
        version,
      ),
      'Payout cycle approved',
    );
  }

  @Get('driver/wallet/payout-methods')
  async payout_methods_list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_methods.list(request.auth!.user_id),
      'Payout methods loaded',
    );
  }

  @Get('driver/wallet/payouts')
  async driver_payouts(
    @Req() request: Request,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = pagination.parse(query);
    return send_success(
      response,
      await this.wallets.driver_payouts(request.auth!.user_id, page, page_size),
      'Driver payouts loaded',
    );
  }

  @Get('driver/wallet/payouts/:id')
  async driver_payout(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.wallets.driver_payout(
        request.auth!.user_id,
        user_id_schema.parse(id),
      ),
      'Payout loaded',
    );
  }

  @Post('driver/wallet/payout-methods')
  @HttpCode(200)
  async payout_method_setup(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_methods.setup(
        request.auth!.user_id,
        payout_method_input.parse(body),
      ),
      'Payout account saved',
    );
  }

  @Patch('driver/wallet/payout-methods/:id/default')
  async payout_method_default(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_methods.set_default(
        request.auth!.user_id,
        user_id_schema.parse(id),
      ),
      'Payout account selected',
    );
  }

  @Post('driver/wallet/payout-methods/:id/check')
  @HttpCode(200)
  async payout_method_check(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_methods.check(
        request.auth!.user_id,
        user_id_schema.parse(id),
      ),
      'Payout method checked',
    );
  }

  @Patch('admin/payouts/drivers/:id')
  @UseGuards(AdminGuard)
  async edit_payout(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_admin.edit(
        request.auth!.user_id,
        user_id_schema.parse(id),
        payout_edit.parse(body),
      ),
      'Driver payout updated',
    );
  }

  @Get('admin/payouts/blocks')
  @UseGuards(AdminGuard)
  async blocks(@Res({ passthrough: true }) response: Response) {
    return send_success(
      response,
      await this.payout_admin.blocks(),
      'Payout blocks loaded',
    );
  }

  @Put('admin/payouts/blocks')
  @UseGuards(AdminGuard)
  async block(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_admin.block(
        request.auth!.user_id,
        payout_block.parse(body),
      ),
      'Payout block updated',
    );
  }

  @Get('wallet/topups')
  async list_topups(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.topups.list(request.auth!.user_id),
      'Wallet top-ups loaded',
    );
  }

  @Post('wallet/topups')
  @HttpCode(200)
  async start_topup(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.topups.start(request.auth!.user_id, start_topup.parse(body)),
      'Top-up checkout loaded',
    );
  }

  @Post('wallet/topups/:id/check')
  @HttpCode(200)
  async check_topup(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reference = topup_reference.safeParse(id);
    if (!reference.success) {
      throw new AppError(
        404,
        'TOPUP_NOT_FOUND',
        'This top-up reference is unavailable. Refresh My Wallet and reopen the top-up from your history.',
      );
    }
    const input = z
      .object({ cancelled: z.boolean().optional() })
      .strict()
      .parse(body ?? {});
    return send_success(
      response,
      await this.topups.check(
        request.auth!.user_id,
        reference.data,
        input.cancelled === true,
      ),
      'Top-up status loaded',
    );
  }

  @Get('admin/payouts/settings')
  @UseGuards(AdminGuard)
  async schedule(@Res({ passthrough: true }) response: Response) {
    return send_success(
      response,
      await this.wallets.schedule(),
      'Payout settings loaded',
    );
  }

  @Put('admin/payouts/settings')
  @UseGuards(AdminGuard)
  async save_schedule(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.wallets.save_schedule(
        request.auth!.user_id,
        payout_settings_schema.parse(body),
      ),
      'Payout settings saved',
    );
  }

  @Get('admin/payouts/cycles')
  @UseGuards(AdminGuard)
  async cycles(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = pagination.parse(query);
    return send_success(
      response,
      await this.wallets.cycles(page, page_size),
      'Payout cycles loaded',
    );
  }

  @Get('admin/payouts/upcoming')
  @UseGuards(AdminGuard)
  async upcoming(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = pagination.parse(query);
    return send_success(
      response,
      await this.wallets.upcoming(page, page_size),
      'Upcoming payouts loaded',
    );
  }

  @Post('admin/payouts/drivers/:id/reconcile')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async reconcile_payout(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = z
      .object({
        provider_id: z
          .string()
          .trim()
          .regex(/^pout_[A-Za-z0-9]{1,80}$/),
      })
      .strict()
      .parse(body);
    return send_success(
      response,
      await this.transfers.reconcile(
        request.auth!.user_id,
        user_id_schema.parse(id),
        input.provider_id,
      ),
      'Payout checked against RazorpayX',
    );
  }

  @Get('admin/payouts/cycles/:id/report')
  @UseGuards(AdminGuard)
  async cycle_report(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.payout_admin.report(user_id_schema.parse(id)),
      'Payout report loaded',
    );
  }

  @Get('admin/payouts/cycles/:id/drivers')
  @UseGuards(AdminGuard)
  async cycle_drivers(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = pagination.parse(query);
    return send_success(
      response,
      await this.wallets.cycle_drivers(
        user_id_schema.parse(id),
        page,
        page_size,
      ),
      'Payout drivers loaded',
    );
  }

  @Get('admin/payouts/drivers/:id/lines')
  @UseGuards(AdminGuard)
  async payout_lines(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, page_size } = pagination.parse(query);
    return send_success(
      response,
      await this.wallets.payout_lines(
        user_id_schema.parse(id),
        page,
        page_size,
      ),
      'Payout breakdown loaded',
    );
  }

  @Get('wallet')
  async view(
    @Req() request: Request,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { kind, page, page_size } = query_schema.parse(query);
    const { user_id } = request.auth!;
    if (kind === 'DRIVER') await this.wallets.require_driver_access(user_id);
    return send_success(
      response,
      await this.wallets.view(user_id, kind, page, page_size),
      'Wallet loaded',
    );
  }

  @Get('admin/users/:id/wallet-ledger')
  @UseGuards(AdminGuard)
  async user_ledger(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { kind, page, page_size, entry_kind, from, to, reference, timeline } =
      ledger_query.parse(query);
    const end = to ? new Date(`${to}T00:00:00+05:30`) : undefined;
    if (end) end.setTime(end.getTime() + 86_400_000);
    const user_id = user_id_schema.parse(id);
    const start = from ? new Date(`${from}T00:00:00+05:30`) : undefined;
    if (timeline) {
      return send_success(
        response,
        await this.wallets.admin_activity(user_id, kind, page, page_size, {
          entry_kind,
          from: start,
          end,
          reference,
        }),
        'User wallet activity loaded',
      );
    }
    const [ledger, reviews] = await Promise.all([
      this.wallets.view(user_id, kind, page, page_size, {
        kind: entry_kind,
        created_at:
          from || end
            ? {
                gte: start,
                lt: end,
              }
            : undefined,
        OR: reference
          ? [
              { id: reference },
              { ride_id: reference },
              { payment_id: reference },
              { topup_id: reference },
              { payout_id: reference },
              { reverses_entry_id: reference },
            ]
          : undefined,
      }),
      kind === 'RIDER' ? this.topups.admin_reviews(user_id) : [],
    ]);
    return send_success(
      response,
      { ...ledger, reviews },
      'User wallet ledger loaded',
    );
  }

  @Post('admin/users/:id/wallet-ledger/topups/:topup_id/reconcile')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async reconcile_topup(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('topup_id') topup_id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { reason, dispute_id } = z
      .object({
        reason: reason_schema,
        dispute_id: z
          .string()
          .trim()
          .regex(/^disp_[A-Za-z0-9]{1,80}$/)
          .optional(),
      })
      .strict()
      .parse(body);
    return send_success(
      response,
      await this.topups.admin_reconcile(
        request.auth!.user_id,
        user_id_schema.parse(id),
        topup_reference.parse(topup_id),
        reason,
        dispute_id,
      ),
      'Top-up reconciled',
    );
  }

  @Post('admin/users/:id/wallet-ledger/rides/:ride_id/refund')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async refund_ride(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('ride_id') ride_id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { reason, platform_funded } = z
      .object({
        reason: reason_schema,
        platform_funded: z.boolean(),
      })
      .strict()
      .parse(body);
    return send_success(
      response,
      await this.wallets.refund_ride(
        request.auth!.user_id,
        user_id_schema.parse(id),
        user_id_schema.parse(ride_id),
        reason,
        platform_funded,
      ),
      'Ride payment refunded',
    );
  }

  @Post('rides/:id/payments/wallet')
  @HttpCode(200)
  async pay_ride(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.wallets.pay_ride(
        request.auth!.user_id,
        user_id_schema.parse(id),
      ),
      'Ride paid from Wallet',
    );
  }

  @Post('rides/:id/payments/upi')
  @HttpCode(200)
  async upi_checkout(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.ride_upi.checkout(
        request.auth!.user_id,
        user_id_schema.parse(id),
      ),
      'UPI checkout loaded',
    );
  }

  @Post('rides/:id/payments/upi/check')
  @HttpCode(200)
  async upi_status(
    @Req() request: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.ride_upi.check(
        request.auth!.user_id,
        user_id_schema.parse(id),
      ),
      'UPI payment status loaded',
    );
  }
}
