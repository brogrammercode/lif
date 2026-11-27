import { Injectable, Logger } from '@nestjs/common';
import { AuditRetentionService } from '../../core/audit_retention.service.js';
import { AppError } from '../../core/error.js';
import { PayoutTransfer } from '../wallet/payout-transfer.js';
import { WalletTopUps } from '../wallet/wallet-topups.js';
import { WalletRepository } from '../wallet/wallet.repo.js';

@Injectable()
export class CronJobs {
  private readonly logger = new Logger(CronJobs.name);

  constructor(
    private readonly audit: AuditRetentionService,
    private readonly wallets: WalletRepository,
    private readonly transfers: PayoutTransfer,
    private readonly topups: WalletTopUps,
  ) {}

  async run() {
    const now = new Date();
    const deadline = now.getTime() + 40_000;
    const audit = this.run_job('audit_retention', () => this.audit.prune());
    const topups = this.run_job('wallet_topup_reconciliation', () =>
      this.topups.reconcile_pending(40, deadline),
    );
    const cycles = this.run_job('payout_cycle_preparation', () =>
      this.wallets.prepare_due_cycles(now, deadline),
    );
    const transfers = cycles.then(() =>
      this.run_job('payout_transfers', () => this.transfers.tick(10, deadline)),
    );
    const results = await Promise.all([audit, topups, cycles, transfers]);
    const failures = results.filter((result) => result.status === 'failed');
    if (failures.length)
      throw new AppError(
        500,
        'CRON_JOBS_FAILED',
        `Scheduled jobs failed: ${failures.map(({ job }) => job).join(', ')}`,
      );
    return { jobs: results };
  }

  private async run_job(job: string, run: () => Promise<unknown>) {
    try {
      await run();
      return { job, status: 'completed' };
    } catch (error) {
      this.logger.error({
        event: 'CRON_JOB_FAILED',
        job,
        error: error instanceof Error ? error.name : typeof error,
      });
      return { job, status: 'failed' };
    }
  }
}
