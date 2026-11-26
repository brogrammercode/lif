import { z } from 'zod';
import type { PayoutSchedule } from '@prisma/client';
import { default_wallet_controls } from './wallet-controls.js';

export const payout_settings_schema = z
  .object({
    expected_version: z.number().int().nonnegative(),
    enabled: z.boolean(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    minute_of_day_ist: z.number().int().min(0).max(1439),
    weekday_ist: z.number().int().min(0).max(6),
    month_day_ist: z.number().int().min(1).max(31),
    minimum_paise: z.string().regex(/^(0|[1-9][0-9]{0,11})$/),
    require_approval: z.boolean(),
    next_run_override: z.iso.datetime().nullable().optional(),
    wallet_ride_collection_enabled: z.boolean().optional(),
    wallet_topup_mode: z.enum(['disabled', 'test', 'live']).optional(),
    wallet_live_topup_approved: z.boolean().optional(),
    razorpay_x_upi_setup_enabled: z.boolean().optional(),
    razorpay_x_transfers_enabled: z.boolean().optional(),
  })
  .strict();

const ist_offset_ms = 330 * 60_000;

type Timing = Pick<
  PayoutSchedule,
  'frequency' | 'minute_of_day_ist' | 'weekday_ist' | 'month_day_ist'
>;

export function next_payout_run(schedule: Timing, now = new Date()) {
  const ist = new Date(now.getTime() + ist_offset_ms);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();
  const day = ist.getUTCDate();
  const minute = schedule.minute_of_day_ist;
  const date = (offset: number) =>
    Date.UTC(year, month, day + offset, 0, minute);
  if (schedule.frequency === 'MONTHLY') {
    const at_month = (offset: number) => {
      const last_day = new Date(
        Date.UTC(year, month + offset + 1, 0),
      ).getUTCDate();
      return Date.UTC(
        year,
        month + offset,
        Math.min(last_day, schedule.month_day_ist),
        0,
        minute,
      );
    };
    const current = at_month(0);
    return new Date(
      (current > ist.getTime() ? current : at_month(1)) - ist_offset_ms,
    );
  }
  const offset =
    schedule.frequency === 'DAILY'
      ? 0
      : (schedule.weekday_ist + 7 - ist.getUTCDay()) % 7;
  const current = date(offset);
  const interval = schedule.frequency === 'DAILY' ? 1 : 7;
  return new Date(
    (current > ist.getTime() ? current : date(offset + interval)) -
      ist_offset_ms,
  );
}

export function present_payout_schedule(row: PayoutSchedule | null) {
  const settings = row ?? {
    enabled: false,
    frequency: 'WEEKLY' as const,
    minute_of_day_ist: 0,
    weekday_ist: 1,
    month_day_ist: 1,
    minimum_paise: 0n,
    require_approval: true,
    version: 0,
  };
  return {
    wallet_ride_collection_enabled:
      row?.wallet_ride_collection_enabled ??
      default_wallet_controls.wallet_ride_collection_enabled,
    wallet_topup_mode:
      row?.wallet_topup_mode ?? default_wallet_controls.wallet_topup_mode,
    wallet_live_topup_approved:
      row?.wallet_live_topup_approved ??
      default_wallet_controls.wallet_live_topup_approved,
    razorpay_x_upi_setup_enabled:
      row?.razorpay_x_upi_setup_enabled ??
      default_wallet_controls.razorpay_x_upi_setup_enabled,
    razorpay_x_transfers_enabled:
      row?.razorpay_x_transfers_enabled ??
      default_wallet_controls.razorpay_x_transfers_enabled,
    enabled: settings.enabled,
    frequency: settings.frequency,
    minute_of_day_ist: settings.minute_of_day_ist,
    weekday_ist: settings.weekday_ist,
    month_day_ist: settings.month_day_ist,
    require_approval: settings.require_approval,
    version: settings.version,
    minimum_paise: String(settings.minimum_paise),
    next_run_at: settings.enabled
      ? (row?.next_run_at ?? next_payout_run(settings, row?.updated_at))
      : null,
  };
}
