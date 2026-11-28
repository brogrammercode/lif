import { AdminWalletController } from './admin-wallet.controller.js';
import { DriverWalletController } from './driver-wallet.controller.js';
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
import { DatabaseModule } from '../../database/database.module.js';
import { WalletLedgerRepository } from './wallet-ledger.repository.js';
import { WalletRideRepository } from './wallet-ride.repository.js';

@Module({
  imports: [DatabaseModule],
  controllers: [
    WalletController,
    DriverWalletController,
    AdminWalletController,
    WalletWebhookController,
  ],
  providers: [
    WalletRepository,
    WalletLedgerRepository,
    WalletRideRepository,
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
