import { Controller, Get, Headers, Header } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { WalletRepository } from './wallet.repo.js';
import { WalletTopUps } from './wallet-topups.js';
import { PayoutTransfer } from './payout-transfer.js';

@Controller('internal/payout-cycles')
export class PayoutCronController {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly topups: WalletTopUps,
    private readonly transfers: PayoutTransfer,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async tick(@Headers('authorization') authorization?: string) {
    const secret = config.CRON_SECRET;
    const supplied = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    if (
      !secret ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'A valid scheduler credential is required.',
      );
    const [cycle] = await Promise.all([
      this.wallets.prepare_due_cycle().then(async (prepared) => {
        await this.transfers.tick();
        return prepared;
      }),
      this.topups.reconcile_pending(),
    ]);
    return {
      status: 'success',
      data: cycle,
      message: 'Payout schedule checked',
    };
  }
}
