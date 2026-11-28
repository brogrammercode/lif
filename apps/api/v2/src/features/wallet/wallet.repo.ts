import {
  requireActiveAdmin,
  requireDriverWalletAccess,
} from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import {
  asSchedule,
  forecastPayouts,
  insertPayoutDrafts,
  lastPayoutCutoff,
  readPayoutSchedule,
  type ScheduleRow,
} from './sql/payout-cycles.sql.js';
import { Injectable } from '@nestjs/common';
import type { PayoutSchedule } from './wallet.rows.js';
import { AppError } from '../../core/error.js';
import type { z } from 'zod';
import {
  cadence_update,
  next_payout_run,
  present_payout_schedule,
  type payout_settings_schema,
} from './payout-schedule.js';
import {
  hasWalletFunding,
  payout_schedule_id,
  payout_schedule_lock,
  presentWalletSettings,
} from './wallet-controls.js';

function admin_schedule_snapshot(row: PayoutSchedule | null) {
  const schedule = present_payout_schedule(row);
  return {
    ...schedule,
    planned_next_run_at: row?.next_run_at ?? schedule.next_run_at,
  };
}

@Injectable()
export class WalletRepository {
  constructor(private readonly postgres: PostgresService) {}

  async schedule() {
    return this.present_admin_schedule(
      this.postgres,
      await readPayoutSchedule(this.postgres, payout_schedule_id),
    );
  }

  private present_admin_schedule(db: SqlClient, row: PayoutSchedule | null) {
    return presentWalletSettings(db, admin_schedule_snapshot(row));
  }

  async upcoming(page: number, page_size: number) {
    return this.postgres.transaction(async (tx) => {
      const schedule = present_payout_schedule(
        await readPayoutSchedule(tx, payout_schedule_id),
      );
      const cutoff = schedule.next_run_at;
      if (!cutoff) return { next_run_at: null, rows: [], has_more: false };
      const { rows } = await tx.query(forecastPayouts, [
        cutoff,
        new Date(),
        schedule.minimum_paise,
        page_size + 1,
        (page - 1) * page_size,
      ]);
      return {
        next_run_at: cutoff,
        rows: rows.slice(0, page_size),
        has_more: rows.length > page_size,
      };
    }, 'REPEATABLE READ');
  }

  async save_schedule(
    actor_id: string,
    input: z.infer<typeof payout_settings_schema>,
  ) {
    return this.postgres.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor_id);
      await tx.query('SELECT pg_advisory_xact_lock($1::int)', [
        payout_schedule_lock,
      ]);
      const current = await readPayoutSchedule(tx, payout_schedule_id);
      if ((current?.version ?? 0) !== input.expected_version)
        throw new AppError(
          409,
          'PAYOUT_SCHEDULE_CHANGED',
          'Payout schedule changed. Reload before saving.',
        );
      if (!('enabled' in input)) {
        const last = await lastPayoutCutoff(tx, payout_schedule_id);
        const cadence = cadence_update(input, current, last, new Date());
        if (!cadence) return this.present_admin_schedule(tx, current);
        if (!cadence.next_run_at)
          throw new AppError(
            422,
            'PAYOUT_RUN_DATE_INVALID',
            'Choose a future payout date after the last recorded cycle.',
          );
        const data = {
          ...cadence.timing,
          next_run_at: cadence.next_run_at,
          replaced_run_at: null,
          enabled: current?.enabled ?? true,
        };
        return this.persist_schedule(tx, actor_id, current, data);
      }
      const { expected_version: _, next_run_override, ...values } = input;
      const mode =
        values.wallet_topup_mode ?? current?.wallet_topup_mode ?? 'disabled';
      if (
        mode === 'live' &&
        !(
          values.wallet_live_topup_approved ??
          current?.wallet_live_topup_approved
        )
      )
        throw new AppError(
          422,
          'WALLET_LIVE_APPROVAL_REQUIRED',
          'Confirm the approved live wallet arrangement before enabling live top-ups.',
        );
      const transfers =
        values.razorpay_x_transfers_enabled ??
        current?.razorpay_x_transfers_enabled ??
        false;
      if (mode !== 'disabled' || transfers) {
        const incompatible_mode =
          mode === 'test' && !transfers ? 'live' : 'test';
        if (
          (mode === 'test' && transfers) ||
          (await hasWalletFunding(tx, incompatible_mode))
        )
          throw new AppError(
            422,
            'WALLET_FUNDING_MODE_CONFLICT',
            'Keep test funding and live payment or payout settings in separate databases.',
          );
      }
      const now = new Date();
      const override = next_run_override ? new Date(next_run_override) : null;
      if (override && (!values.enabled || override <= now))
        throw new AppError(
          422,
          'PAYOUT_RUN_DATE_INVALID',
          'Enable the schedule and choose a future payout date and time.',
        );
      const timing_changed =
        !current ||
        (!current.enabled &&
          values.enabled &&
          (!current.next_run_at || current.next_run_at <= now)) ||
        values.frequency !== current.frequency ||
        values.minute_of_day_ist !== current.minute_of_day_ist ||
        (values.frequency === 'WEEKLY' &&
          values.weekday_ist !== current.weekday_ist) ||
        (values.frequency === 'MONTHLY' &&
          values.month_day_ist !== current.month_day_ist);
      const reset = timing_changed || next_run_override === null;
      const recurring_run = reset
        ? next_payout_run(values, now)
        : (current?.replaced_run_at ??
          current?.next_run_at ??
          next_payout_run(values, current?.updated_at));
      const next_run_at = values.enabled
        ? (override ??
          (reset ? recurring_run : (current?.next_run_at ?? recurring_run)))
        : (current?.next_run_at ?? null);
      const replaced_run_at =
        reset && !override
          ? null
          : override
            ? recurring_run
            : (current?.replaced_run_at ?? null);
      const last =
        next_run_at && override
          ? await lastPayoutCutoff(tx, payout_schedule_id)
          : null;
      if (last && override && override <= last)
        throw new AppError(
          422,
          'PAYOUT_RUN_DATE_INVALID',
          'Choose a date after the last recorded cycle.',
        );
      const data = {
        ...values,
        minimum_paise: BigInt(values.minimum_paise),
        next_run_at,
        replaced_run_at,
      };
      return this.persist_schedule(tx, actor_id, current, data);
    });
  }

  private async persist_schedule(
    tx: SqlClient,
    actor_id: string,
    current: PayoutSchedule | null,
    data: Partial<Omit<PayoutSchedule, 'id' | 'version' | 'updated_at'>>,
  ) {
    const base = present_payout_schedule(current);
    const {
      rows: [row],
    } = await tx.query<ScheduleRow>(
      `INSERT INTO payout_schedules (id,enabled,frequency,minute_of_day_ist,weekday_ist,month_day_ist,
        minimum_paise,require_approval,next_run_at,replaced_run_at,
        razorpay_ride_upi_enabled,wallet_ride_collection_enabled,wallet_topup_mode,wallet_live_topup_approved,
        razorpay_x_upi_setup_enabled,razorpay_x_transfers_enabled,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,clock_timestamp())
      ON CONFLICT(id) DO UPDATE SET enabled=EXCLUDED.enabled,frequency=EXCLUDED.frequency,
        minute_of_day_ist=EXCLUDED.minute_of_day_ist,weekday_ist=EXCLUDED.weekday_ist,
        month_day_ist=EXCLUDED.month_day_ist,minimum_paise=EXCLUDED.minimum_paise,
        require_approval=EXCLUDED.require_approval,next_run_at=EXCLUDED.next_run_at,replaced_run_at=EXCLUDED.replaced_run_at,
        razorpay_ride_upi_enabled=EXCLUDED.razorpay_ride_upi_enabled,
        wallet_ride_collection_enabled=EXCLUDED.wallet_ride_collection_enabled,wallet_topup_mode=EXCLUDED.wallet_topup_mode,
        wallet_live_topup_approved=EXCLUDED.wallet_live_topup_approved,
        razorpay_x_upi_setup_enabled=EXCLUDED.razorpay_x_upi_setup_enabled,
        razorpay_x_transfers_enabled=EXCLUDED.razorpay_x_transfers_enabled,
        updated_at=clock_timestamp(),version=payout_schedules.version+1 RETURNING *`,
      [
        payout_schedule_id,
        data.enabled ?? base.enabled,
        data.frequency ?? base.frequency,
        data.minute_of_day_ist ?? base.minute_of_day_ist,
        data.weekday_ist ?? base.weekday_ist,
        data.month_day_ist ?? base.month_day_ist,
        String(data.minimum_paise ?? base.minimum_paise),
        data.require_approval ?? base.require_approval,
        data.next_run_at ?? null,
        data.replaced_run_at ?? null,
        data.razorpay_ride_upi_enabled ?? base.razorpay_ride_upi_enabled,
        data.wallet_ride_collection_enabled ??
          base.wallet_ride_collection_enabled,
        data.wallet_topup_mode ?? base.wallet_topup_mode,
        data.wallet_live_topup_approved ?? base.wallet_live_topup_approved,
        data.razorpay_x_upi_setup_enabled ?? base.razorpay_x_upi_setup_enabled,
        data.razorpay_x_transfers_enabled ?? base.razorpay_x_transfers_enabled,
      ],
    );
    if (!row) throw new Error('Payout schedule missing after save');
    const saved = asSchedule(row);
    await insertUserLog(tx, {
      actor_id,
      entity_type: 'PayoutSchedule',
      entity_id: saved.id,
      action: 'UPDATE_PAYOUT_SCHEDULE',
      before_data: admin_schedule_snapshot(current),
      after_data: admin_schedule_snapshot(saved),
    });
    return this.present_admin_schedule(tx, saved);
  }

  async prepare_due_cycles(now: Date, deadline: number) {
    for (let batch = 0; batch < 10 && Date.now() < deadline; batch++) {
      const cycle = await this.prepare_due_cycle(now);
      if (!cycle.prepared) break;
    }
  }

  async prepare_due_cycle(now = new Date()) {
    return this.postgres.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1::int)', [
        payout_schedule_lock,
      ]);
      const schedule = await readPayoutSchedule(tx, payout_schedule_id);
      if (!schedule?.enabled) return { prepared: false };
      const storedDue =
        schedule.next_run_at ?? next_payout_run(schedule, schedule.updated_at);
      if (storedDue > now) return { prepared: false };
      const last = await lastPayoutCutoff(tx, schedule.id);
      const due =
        last && storedDue <= last ? next_payout_run(schedule, last) : storedDue;
      if (due > now) {
        await tx.query(
          'UPDATE payout_schedules SET next_run_at=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1',
          [schedule.id, due],
        );
        return { prepared: false };
      }
      const {
        rows: [cycle],
      } = await tx.query<{ id: string }>(
        `INSERT INTO payout_cycles (id,schedule_id,period_start,cutoff_at,scheduled_at,schedule_snapshot)
          VALUES ($1,$2,$3,$4,$4,$5::jsonb)
          ON CONFLICT(schedule_id,cutoff_at) DO UPDATE SET cutoff_at=EXCLUDED.cutoff_at RETURNING id`,
        [
          nextEntityId(),
          schedule.id,
          last ?? schedule.updated_at,
          due,
          JSON.stringify({
            version: schedule.version,
            frequency: schedule.frequency,
            minimum_paise: String(schedule.minimum_paise),
            require_approval: schedule.require_approval,
          }),
        ],
      );
      if (!cycle) throw new Error('Payout cycle missing during preparation');
      await tx.query(insertPayoutDrafts, [due, now, cycle.id]);
      const next = next_payout_run(
        schedule,
        schedule.replaced_run_at && schedule.replaced_run_at > due
          ? schedule.replaced_run_at
          : due,
      );
      await tx.query(
        `UPDATE payout_schedules SET next_run_at=$2,replaced_run_at=NULL,version=version+1,
          updated_at=clock_timestamp() WHERE id=$1`,
        [schedule.id, next],
      );
      return { prepared: true, cycle_id: cycle.id };
    });
  }

  async cycles(page: number, page_size: number) {
    return this.postgres.transaction(async (tx) => {
      const { rows: cycles } = await tx.query<{ id: string }>(
        `SELECT c.id,c.period_start,c.cutoff_at,c.scheduled_at,c.status,c.version,
          jsonb_build_object('payouts',(SELECT count(*) FROM driver_payouts p WHERE p.cycle_id=c.id)) AS _count
          FROM payout_cycles c ORDER BY c.scheduled_at DESC,c.id DESC LIMIT $1 OFFSET $2`,
        [page_size + 1, (page - 1) * page_size],
      );
      const visible = cycles.slice(0, page_size);
      const totals = await this.earnings_totals(
        tx,
        visible.map((cycle) => cycle.id),
        true,
      );
      return {
        page,
        has_more: cycles.length > page_size,
        rows: visible.map((cycle) => ({
          ...cycle,
          ride_earnings: totals.get(cycle.id) ?? null,
        })),
      };
    }, 'REPEATABLE READ');
  }

  async cycle_drivers(id: string, page: number, page_size: number) {
    return this.postgres.transaction(async (tx) => {
      const {
        rows: [cycle],
      } = await tx.query(
        'SELECT id,status,version FROM payout_cycles WHERE id=$1',
        [id],
      );
      if (!cycle)
        throw new AppError(
          404,
          'PAYOUT_CYCLE_NOT_FOUND',
          'Payout cycle not found.',
        );
      const { rows } = await tx.query<{ id: string }>(
        `SELECT p.id,p.amount_paise::text,p.updated_at,p.status,p.exclusion_reason,
          jsonb_build_object('user',jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name)) AS wallet,
          COALESCE((SELECT jsonb_agg(to_jsonb(last)) FROM (
            SELECT a.status,a.provider_payout_id,a.utr,a.failure_code FROM driver_payout_attempts a
            WHERE a.payout_id=p.id ORDER BY a.attempt_number DESC LIMIT 1
          ) last),'[]'::jsonb) AS attempts,
          jsonb_build_object('lines',(SELECT count(*) FROM driver_payout_lines l WHERE l.payout_id=p.id)) AS _count
          FROM driver_payouts p JOIN wallets w ON w.id=p.wallet_id JOIN users u ON u.id=w.user_id
          WHERE p.cycle_id=$1 ORDER BY p.created_at,p.id LIMIT $2 OFFSET $3`,
        [id, page_size + 1, (page - 1) * page_size],
      );
      const visible = rows.slice(0, page_size);
      const breakdown = await this.earnings_totals(
        tx,
        visible.map((row) => row.id),
        false,
      );
      return {
        cycle,
        page,
        has_more: rows.length > page_size,
        rows: visible.map((row) => ({
          ...row,
          ride_earnings: breakdown.get(row.id) ?? null,
        })),
      };
    }, 'REPEATABLE READ');
  }

  private async earnings_totals(
    tx: SqlClient,
    ids: string[],
    by_cycle: boolean,
  ) {
    if (!ids.length) return new Map();
    const group = by_cycle ? 'p.cycle_id' : 'p.id';
    const { rows } = await tx.query<{
      id: string;
      gross_paise: string;
      commission_paise: string;
      driver_net_paise: string;
    }>(
      `SELECT ${group} AS id,
        sum(CASE WHEN e.kind='CASH_PAYMENT' THEN 0
          ELSE e.available_delta_paise+COALESCE(e.commission_paise,0) END)::text AS gross_paise,
        sum(COALESCE(e.commission_paise,0))::text AS commission_paise,sum(l.amount_paise)::text AS driver_net_paise
        FROM driver_payout_lines l JOIN driver_payouts p ON p.id=l.payout_id
        JOIN wallet_entries e ON e.id=l.source_entry_id
        WHERE ${group}=ANY($1::text[]) AND e.kind IN ('RIDE_EARNING','CASH_PAYMENT')
        GROUP BY ${group}`,
      [ids],
    );
    return new Map(rows.map(({ id, ...amounts }) => [id, amounts]));
  }

  async payout_lines(id: string, page: number, page_size: number) {
    return this.postgres.transaction(async (tx) => {
      const {
        rows: [payout],
      } = await tx.query('SELECT id FROM driver_payouts WHERE id=$1', [id]);
      if (!payout)
        throw new AppError(
          404,
          'DRIVER_PAYOUT_NOT_FOUND',
          'Driver payout not found.',
        );
      const { rows } = await tx.query(
        `SELECT l.*,l.amount_paise::text AS amount_paise,
          CASE WHEN e.commission_paise IS NOT NULL THEN
            COALESCE(e.external_amount_paise,e.available_delta_paise+e.commission_paise)::text END AS gross_paise,
          e.commission_paise::text AS commission_paise,trim_scale(e.commission_percent)::text AS commission_percent,
          CASE WHEN e.commission_paise IS NOT NULL THEN
            COALESCE(e.external_amount_paise-e.commission_paise,e.available_delta_paise)::text END AS driver_net_paise,
          CASE WHEN r.id IS NOT NULL THEN jsonb_build_object('id',r.id,'final_fare',trim_scale(r.final_fare)::text,
            'completed_at',to_char(r.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END AS ride
          FROM driver_payout_lines l LEFT JOIN wallet_entries e ON e.id=l.source_entry_id
          LEFT JOIN rides r ON r.id=l.ride_id WHERE l.payout_id=$1
          ORDER BY l.created_at,l.id LIMIT $2 OFFSET $3`,
        [id, page_size + 1, (page - 1) * page_size],
      );
      return {
        page,
        has_more: rows.length > page_size,
        rows: rows.slice(0, page_size),
      };
    }, 'REPEATABLE READ');
  }

  async driver_payout(user_id: string, id: string) {
    return this.postgres.transaction(async (tx) => {
      const {
        rows: [row],
      } = await tx.query<{ id: string }>(
        `SELECT p.id,p.amount_paise::text,p.status,m.masked_label AS masked_destination,c.scheduled_at,c.cutoff_at,
          (SELECT a.utr FROM driver_payout_attempts a WHERE a.payout_id=p.id ORDER BY a.attempt_number DESC LIMIT 1) AS utr,
          (SELECT COALESCE(sum(l.amount_paise),0)::text FROM driver_payout_lines l
            WHERE l.payout_id=p.id AND l.source_entry_id IS NULL) AS adjustments_paise
          FROM driver_payouts p JOIN wallets w ON w.id=p.wallet_id JOIN payout_cycles c ON c.id=p.cycle_id
          LEFT JOIN driver_payout_methods m ON m.id=p.method_id
          WHERE p.id=$1 AND w.user_id=$2 AND w.kind='DRIVER'`,
        [id, user_id],
      );
      if (!row)
        throw new AppError(404, 'PAYOUT_NOT_FOUND', 'Payout not found.');
      const totals = await this.earnings_totals(tx, [id], false);
      return { ...row, ride_earnings: totals.get(id) ?? null };
    }, 'REPEATABLE READ');
  }

  async driver_payouts(user_id: string, page: number, page_size: number) {
    return this.postgres.transaction(async (tx) => {
      await requireDriverWalletAccess(tx, user_id);
      const settings = await readPayoutSchedule(tx, payout_schedule_id);
      const { rows } = await tx.query(
        `SELECT e.id,e.payout_id,e.available_delta_paise::text,e.held_delta_paise::text,
          e.available_after_paise::text,e.created_at,e.kind
          FROM wallet_entries e JOIN wallets w ON w.id=e.wallet_id JOIN driver_payouts p ON p.id=e.payout_id
          WHERE w.user_id=$1 AND w.kind='DRIVER' AND e.kind='PAYOUT_SETTLED' AND p.status='PAID'
          ORDER BY e.created_at DESC,e.id DESC LIMIT $2 OFFSET $3`,
        [user_id, page_size + 1, (page - 1) * page_size],
      );
      return {
        next_run_at: present_payout_schedule(settings).next_run_at,
        rows: rows.slice(0, page_size),
        has_more: rows.length > page_size,
      };
    });
  }
}
