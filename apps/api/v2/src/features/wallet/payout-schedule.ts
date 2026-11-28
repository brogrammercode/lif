import { z } from 'zod';
import type { PayoutSchedule } from './wallet.rows.js';
import { default_wallet_controls } from './wallet-controls.js';

const legacy_payout_settings_schema = z
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
    razorpay_ride_upi_enabled: z.boolean().optional(),
    wallet_ride_collection_enabled: z.boolean().optional(),
    wallet_topup_mode: z.enum(['disabled', 'test', 'live']).optional(),
    wallet_live_topup_approved: z.boolean().optional(),
    razorpay_x_upi_setup_enabled: z.boolean().optional(),
    razorpay_x_transfers_enabled: z.boolean().optional(),
  })
  .strict();

const cadence_settings_schema = z.strictObject({
  expected_version: z.number().int().nonnegative(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  next_run_date: z.iso.date().optional(),
});

export const payout_settings_schema = z.union([
  legacy_payout_settings_schema,
  cadence_settings_schema,
]);

const ist_offset_ms = 330 * 60_000;

type Timing = Pick<
  PayoutSchedule,
  'frequency' | 'minute_of_day_ist' | 'weekday_ist' | 'month_day_ist'
>;

const ist_day = (date: Date) =>
  new Date(date.getTime() + ist_offset_ms).toISOString().slice(0, 10);

const daily_check = (day: string) => new Date(`${day}T05:00:00+05:30`);

export function cadence_update(
  input: Pick<
    z.infer<typeof cadence_settings_schema>,
    'frequency' | 'next_run_date'
  >,
  current: (Timing & { next_run_at: Date | null }) | null,
  last_cutoff: Date | null,
  now: Date,
) {
  if (
    !input.next_run_date &&
    current?.frequency === input.frequency &&
    current.minute_of_day_ist === 300 &&
    current.next_run_at
  )
    return null;

  const anchor = daily_check(
    input.next_run_date ?? ist_day(last_cutoff ?? now),
  );
  const timing_for = (date: Date) => {
    const ist = new Date(date.getTime() + ist_offset_ms);
    return {
      frequency: input.frequency,
      minute_of_day_ist: 300,
      weekday_ist: ist.getUTCDay(),
      month_day_ist: ist.getUTCDate(),
    };
  };
  const timing = timing_for(anchor);
  const next = input.next_run_date
    ? anchor
    : last_cutoff
      ? next_payout_run(timing, anchor)
      : anchor;
  if (
    input.next_run_date &&
    (next <= now || (last_cutoff && next <= last_cutoff))
  ) {
    return { timing, next_run_at: null };
  }
  if (next > now) return { timing, next_run_at: next };
  const next_run_at = next_payout_run({ ...timing, frequency: 'DAILY' }, now);
  return { timing: timing_for(next_run_at), next_run_at };
}

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
    razorpay_ride_upi_enabled: row?.razorpay_ride_upi_enabled ?? false,
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
