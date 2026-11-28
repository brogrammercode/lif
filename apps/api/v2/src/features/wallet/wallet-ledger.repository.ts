import { Injectable } from '@nestjs/common';
import type { WalletEntryKind, WalletKind } from './wallet.rows.js';
import { requireDriverWalletAccess } from '../../database/account-locks.js';
import { PostgresService } from '../../database/postgres.service.js';
import {
  driverBalance,
  driverEarnings,
  ledgerEntries,
  ledgerTimeline,
  walletRow,
} from './sql/wallet-ledger.sql.js';

type LedgerFilter = {
  entry_kind?: WalletEntryKind;
  from?: Date;
  end?: Date;
  reference?: string;
};
type WalletBalance = {
  id: string;
  currency: string;
  available_paise: string;
  held_paise: string;
};
type PayoutBalance = {
  payout_available_paise: string;
  cash_collected_paise: string;
};

const ledgerParams = (
  id: string,
  filters: LedgerFilter | undefined,
  page: number,
  pageSize: number,
) => [
  id,
  filters?.entry_kind ?? null,
  filters?.from ?? null,
  filters?.end ?? null,
  filters?.reference ?? null,
  pageSize + 1,
  (page - 1) * pageSize,
];

@Injectable()
export class WalletLedgerRepository {
  constructor(private readonly db: PostgresService) {}

  async requireDriverAccess(userId: string) {
    await this.db.transaction((tx) => requireDriverWalletAccess(tx, userId));
  }

  async view(
    userId: string,
    kind: WalletKind,
    page: number,
    pageSize: number,
    filters?: LedgerFilter,
  ) {
    return this.db.transaction(async (tx) => {
      const {
        rows: [wallet],
      } = await tx.query<WalletBalance>(walletRow, [userId, kind]);
      const rows = wallet
        ? (
            await tx.query<{ entry: Record<string, unknown> }>(
              ledgerEntries,
              ledgerParams(wallet.id, filters, page, pageSize),
            )
          ).rows
        : [];
      const driverSummary: {
        earnings_paise?: string;
      } & Partial<PayoutBalance> = {};
      if (kind === 'DRIVER') {
        driverSummary.earnings_paise = wallet
          ? ((
              await tx.query<{ earnings_paise: string }>(driverEarnings, [
                wallet.id,
              ])
            ).rows[0]?.earnings_paise ?? '0')
          : '0';
        if (!filters) {
          Object.assign(
            driverSummary,
            wallet
              ? (
                  await tx.query<PayoutBalance>(driverBalance, [
                    wallet.id,
                    wallet.available_paise,
                    new Date(),
                  ])
                ).rows[0]
              : { payout_available_paise: '0', cash_collected_paise: '0' },
          );
        }
      }
      return {
        ...(wallet ? { id: wallet.id } : {}),
        kind,
        currency: wallet?.currency ?? 'INR',
        available_paise: wallet?.available_paise ?? '0',
        held_paise: wallet?.held_paise ?? '0',
        ...driverSummary,
        page,
        has_more: rows.length > pageSize,
        rows: rows.slice(0, pageSize).map(({ entry }) => entry),
      };
    }, 'REPEATABLE READ');
  }

  async adminActivity(
    userId: string,
    kind: WalletKind,
    page: number,
    pageSize: number,
    filters: LedgerFilter,
  ) {
    return this.db.transaction(async (tx) => {
      const {
        rows: [wallet],
      } = await tx.query<WalletBalance>(walletRow, [userId, kind]);
      const balance = {
        available_paise: wallet?.available_paise ?? '0',
        held_paise: wallet?.held_paise ?? '0',
      };
      if (!wallet) return { ...balance, has_more: false, activity: [] };
      const attempts =
        kind === 'RIDER' &&
        (!filters.entry_kind || filters.entry_kind === 'TOP_UP');
      const { rows } = await tx.query<{
        id: string;
        source: 'entry' | 'attempt';
        created_at: Date;
        entry: Record<string, unknown> | null;
        topup: Record<string, unknown> | null;
      }>(ledgerTimeline, [
        ...ledgerParams(wallet.id, filters, page, pageSize),
        attempts,
      ]);
      return {
        ...balance,
        has_more: rows.length > pageSize,
        activity: rows
          .slice(0, pageSize)
          .map(({ entry, topup, ...summary }) => ({
            ...summary,
            ...(entry ? { entry } : {}),
            ...(topup ? { topup } : {}),
          })),
      };
    }, 'REPEATABLE READ');
  }
}
