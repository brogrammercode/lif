import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { PayoutCronController } from './payout-cron.controller.js';
import { WalletRepository } from './wallet.repo.js';
import { WalletTopUps } from './wallet-topups.js';
import { RazorpayWallet } from './razorpay-wallet.js';
import { WalletWebhookController } from './wallet-webhook.controller.js';
import { PayoutAdmin } from './payout-admin.js';
import { PayoutMethods } from './payout-methods.js';
import { PayoutTransfer } from './payout-transfer.js';

@Module({
  controllers: [
    WalletController,
    PayoutCronController,
    WalletWebhookController,
  ],
  providers: [
    WalletRepository,
    WalletTopUps,
    RazorpayWallet,
    PayoutAdmin,
    PayoutMethods,
    PayoutTransfer,
  ],
})
export class WalletModule {}
