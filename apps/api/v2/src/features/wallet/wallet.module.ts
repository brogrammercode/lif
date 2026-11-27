import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { WalletRepository } from './wallet.repo.js';
import { WalletTopUps } from './wallet-topups.js';
import { RazorpayWallet } from './razorpay-wallet.js';
import { WalletWebhookController } from './wallet-webhook.controller.js';
import { PayoutAdmin } from './payout-admin.js';
import { PayoutMethods } from './payout-methods.js';
import { PayoutTransfer } from './payout-transfer.js';
import { RideUpi } from './ride-upi.js';

@Module({
  controllers: [WalletController, WalletWebhookController],
  providers: [
    WalletRepository,
    WalletTopUps,
    RazorpayWallet,
    PayoutAdmin,
    PayoutMethods,
    PayoutTransfer,
    RideUpi,
  ],
  exports: [WalletRepository, WalletTopUps, PayoutTransfer],
})
export class WalletModule {}
