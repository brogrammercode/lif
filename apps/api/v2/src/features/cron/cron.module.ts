import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module.js';
import { CronController } from './cron.controller.js';
import { CronJobs } from './cron.jobs.js';

@Module({
  imports: [WalletModule],
  controllers: [CronController],
  providers: [CronJobs],
})
export class CronModule {}
