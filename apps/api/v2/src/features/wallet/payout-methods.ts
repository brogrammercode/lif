import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DriverPayoutMethod } from '@prisma/client';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import {
  require_active_account,
  require_driver_participation,
} from '../../infra/database/account_lifecycle.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  razorpay_x_credentials_ready,
  payout_schedule_lock,
  read_wallet_controls,
} from './wallet-controls.js';

export const payout_method_input = z
  .object({
    name: z.string().trim().min(3).max(50),
    vpa: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-z0-9.-]+@[a-z0-9.-]+$/i),
  })
  .strict();

const validation_schema = z.object({
  id: z.string().regex(/^fav_[A-Za-z0-9]+$/),
  reference_id: z.string().nullish(),
  status: z.enum(['created', 'completed', 'failed']),
  fund_account: z
    .object({
      id: z.string().regex(/^fa_[A-Za-z0-9]+$/),
      account_type: z.literal('vpa'),
      active: z.boolean(),
      contact: z.object({ id: z.string() }).nullish(),
      contact_id: z.string().nullish(),
      vpa: z.object({ address: z.string() }),
    })
    .nullish(),
  validation_results: z
    .object({
      account_status: z.string().nullish(),
      registered_name: z.string().nullish(),
    })
    .nullish(),
});

const name_hash = (name: string) =>
  createHash('sha256')
    .update(
      name
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, ''),
    )
    .digest('hex');
const vpa_hash = (vpa: string) =>
  createHash('sha256').update(vpa.toLowerCase()).digest('hex');
const mask_vpa = (vpa: string) => {
  const [prefix, handle] = vpa.toLowerCase().split('@');
  return `${prefix?.slice(0, 2)}•••@${handle}`;
};
const matches_destination = (row: DriverPayoutMethod, address: string) =>
  row.destination_hash
    ? vpa_hash(address) === row.destination_hash
    : mask_vpa(address) === row.masked_label;
const validation_list = z.object({ items: z.array(z.unknown()) });
const unavailable = () =>
  new AppError(
    503,
    'PAYOUT_SETUP_UNAVAILABLE',
    'Payout verification is unavailable.',
  );

@Injectable()
export class PayoutMethods {
  constructor(private readonly db: PrismaService) {}

  async list(driver_id: string) {
    const [rows, controls] = await Promise.all([
      this.db.client.driverPayoutMethod.findMany({
        where: { driver_id, status: { not: 'DISABLED' } },
        orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
        take: 10,
      }),
      read_wallet_controls(this.db.client),
    ]);
    return {
      upi_enabled:
        controls.razorpay_x_upi_setup_enabled && razorpay_x_credentials_ready(),
      debit_card_enabled: false,
      rows: rows.map(present),
    };
  }

  async setup(driver_id: string, input: z.infer<typeof payout_method_input>) {
    if (!razorpay_x_credentials_ready()) throw unavailable();
    const vpa = input.vpa.toLowerCase();
    const destination_hash = vpa_hash(vpa);
    const beneficiary_name_hash = name_hash(input.name);
    const { row, existing } = await this.db.client.$transaction(async (tx) => {
      const driver = await require_active_account(tx, driver_id);
      if (driver.role !== 'DRIVER')
        throw new AppError(
          403,
          'DRIVER_ACCESS_REQUIRED',
          'Driver access is required.',
        );
      await require_driver_participation(tx, driver_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${payout_schedule_lock}::int)`;
      if (!(await read_wallet_controls(tx)).razorpay_x_upi_setup_enabled)
        throw unavailable();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720068, hashtext(${driver_id}))`;
      const today = new Date(Date.now() - 24 * 60 * 60_000);
      const pending = await tx.driverPayoutMethod.findFirst({
        where: {
          driver_id,
          status: 'PENDING',
          destination_hash,
          beneficiary_name_hash,
          created_at: { gte: today },
        },
        orderBy: { created_at: 'desc' },
      });
      if (pending) return { row: pending, existing: true };
      if (
        (await tx.driverPayoutMethod.count({
          where: { driver_id, created_at: { gte: today } },
        })) >= 3
      )
        throw new AppError(
          429,
          'PAYOUT_SETUP_LIMIT',
          'Try another payout verification tomorrow.',
        );
      const row = await tx.driverPayoutMethod.create({
        data: {
          driver_id,
          kind: 'UPI',
          masked_label: mask_vpa(vpa),
          beneficiary_name_hash,
          destination_hash,
        },
      });
      return { row, existing: false };
    });
    if (existing) return this.check(driver_id, row.id);
    const response = await this.request(
      '/fund_accounts/validations',
      validation_schema,
      {
        source_account_number: config.RAZORPAY_X_SOURCE_ACCOUNT,
        validation_type: 'pennydrop',
        reference_id: row.id,
        fund_account: {
          account_type: 'vpa',
          vpa: { address: vpa },
          contact: {
            name: input.name,
            type: 'vendor',
            reference_id: driver_id,
          },
        },
      },
    );
    if (
      (response.reference_id !== row.id &&
        !(response.status === 'failed' && !response.reference_id)) ||
      (response.fund_account &&
        response.fund_account.vpa.address.toLowerCase() !== vpa)
    )
      throw unavailable();
    return this.apply(row, response);
  }

  async check(driver_id: string, id: string) {
    const row = await this.db.client.driverPayoutMethod.findFirst({
      where: { id, driver_id },
    });
    if (!row)
      throw new AppError(
        404,
        'PAYOUT_METHOD_NOT_FOUND',
        'Payout method not found.',
      );
    if (row.status !== 'PENDING') return present(row);
    if (!razorpay_x_credentials_ready()) throw unavailable();
    const validation = row.provider_validation_id
      ? await this.request(
          `/fund_accounts/validations/${encodeURIComponent(row.provider_validation_id)}`,
          validation_schema,
        )
      : await this.find_pending(row);
    if (!validation) return present(row);
    if (
      (row.provider_validation_id &&
        validation.id !== row.provider_validation_id) ||
      (validation.reference_id && validation.reference_id !== row.id) ||
      (validation.fund_account &&
        !matches_destination(row, validation.fund_account.vpa.address)) ||
      (row.provider_fund_account_id &&
        validation.fund_account &&
        row.provider_fund_account_id !== validation.fund_account.id)
    )
      throw unavailable();
    return this.apply(row, validation);
  }

  private async find_pending(row: DriverPayoutMethod) {
    const second = Math.floor(row.created_at.getTime() / 1000);
    const query = new URLSearchParams({
      account_number: config.RAZORPAY_X_SOURCE_ACCOUNT,
      from: String(second - 60),
      to: String(second + 600),
      count: '100',
    });
    for (let skip = 0; skip < 300; skip += 100) {
      query.set('skip', String(skip));
      const result = await this.request(
        `/fund_accounts/validations?${query}`,
        validation_list,
      );
      for (const item of result.items) {
        const parsed = validation_schema.safeParse(item);
        if (
          parsed.success &&
          parsed.data.reference_id === row.id &&
          (parsed.data.status === 'failed' ||
            (parsed.data.fund_account &&
              matches_destination(row, parsed.data.fund_account.vpa.address)))
        )
          return parsed.data;
      }
      if (result.items.length < 100) break;
    }
    return null;
  }

  private apply(
    row: DriverPayoutMethod,
    validation: z.infer<typeof validation_schema>,
  ) {
    return this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720068, hashtext(${row.driver_id}))`;
      const current = await tx.driverPayoutMethod.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (current.status !== 'PENDING') return present(current);
      const fund = validation.fund_account;
      const name = validation.validation_results?.registered_name;
      const verified =
        validation.status === 'completed' &&
        fund?.active &&
        validation.validation_results?.account_status === 'active' &&
        Boolean(name && name_hash(name) === current.beneficiary_name_hash);
      const duplicate =
        verified &&
        fund &&
        (await tx.driverPayoutMethod.findUnique({
          where: { provider_fund_account_id: fund.id },
        }));
      if (duplicate && duplicate.id !== row.id) {
        if (
          duplicate.driver_id === row.driver_id &&
          duplicate.status !== 'VERIFIED' &&
          duplicate.kind === 'UPI'
        )
          await tx.driverPayoutMethod.update({
            where: { id: duplicate.id },
            data: { provider_fund_account_id: null },
          });
        else {
          const archived = await tx.driverPayoutMethod.update({
            where: { id: row.id },
            data: {
              status:
                duplicate.driver_id === row.driver_id ? 'DISABLED' : 'FAILED',
              provider_validation_id: validation.id,
            },
          });
          return present(
            duplicate.driver_id === row.driver_id ? duplicate : archived,
          );
        }
      }
      const newer =
        verified &&
        (await tx.driverPayoutMethod.findFirst({
          where: {
            driver_id: row.driver_id,
            is_default: true,
            created_at: { gt: current.created_at },
          },
          select: { id: true },
        }));
      const make_default = Boolean(verified && !newer);
      if (make_default)
        await tx.driverPayoutMethod.updateMany({
          where: { driver_id: row.driver_id, is_default: true },
          data: { is_default: false },
        });
      return present(
        await tx.driverPayoutMethod.update({
          where: { id: row.id },
          data: {
            provider_validation_id: validation.id,
            provider_fund_account_id: verified ? fund.id : null,
            provider_contact_id:
              fund?.contact?.id ?? fund?.contact_id ?? undefined,
            status: verified
              ? 'VERIFIED'
              : validation.status === 'created'
                ? 'PENDING'
                : 'FAILED',
            is_default: make_default,
          },
        }),
      );
    });
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: object,
  ): Promise<T> {
    try {
      const result = await fetch(`https://api.razorpay.com/v1${path}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${config.RAZORPAY_X_KEY_ID}:${config.RAZORPAY_X_KEY_SECRET}`).toString('base64')}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (result.ok) return schema.parse(await result.json());
    } catch {
      /* Provider errors can contain private account details. */
    }
    throw unavailable();
  }
}

function present(row: DriverPayoutMethod) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    masked_label: row.masked_label,
    is_default: row.is_default,
  };
}
