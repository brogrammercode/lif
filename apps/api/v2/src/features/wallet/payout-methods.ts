import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { z } from 'zod';
import type { DriverPayoutMethod } from '@prisma/client';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { require_driver_wallet_access } from '../../infra/database/account_lifecycle.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  payout_schedule_lock,
  razorpay_x_credentials_ready,
  read_wallet_controls,
} from './wallet-controls.js';

const name = z.string().trim().min(3).max(50);
const vpa = z
  .string()
  .trim()
  .toLowerCase()
  .max(100)
  .regex(/^[a-z0-9.-]+@[a-z0-9.-]+$/);
const bank = {
  name,
  account_number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{5,35}$/),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
};
const destination_input = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('UPI'), name, vpa }),
  z.strictObject({ kind: z.literal('BANK_ACCOUNT'), ...bank }),
  z.strictObject({
    kind: z.literal('DEBIT_CARD'),
    ...bank,
    card_last_four: z
      .string()
      .trim()
      .regex(/^\d{4}$/),
  }),
]);
type Destination = z.infer<typeof destination_input>;
export const payout_method_input = z.union([
  destination_input,
  z
    .strictObject({ name, vpa })
    .transform((input) => ({ kind: 'UPI' as const, ...input })),
]);

const contact_schema = z.object({
  id: z.string().regex(/^cont_[A-Za-z0-9]+$/),
  reference_id: z.string(),
  active: z.literal(true),
});
const fund_fields = {
  id: z.string().regex(/^fa_[A-Za-z0-9]+$/),
  contact_id: z.string(),
  active: z.literal(true),
};
const fund_schema = z.discriminatedUnion('account_type', [
  z.object({
    ...fund_fields,
    account_type: z.literal('vpa'),
    vpa: z.object({ address: z.string() }),
  }),
  z.object({
    ...fund_fields,
    account_type: z.literal('bank_account'),
    bank_account: z.object({ ifsc: z.string(), account_number: z.string() }),
  }),
]);

// Derive distinct keys for encryption and lookup. Bind ciphertext to its owner.
const key = (purpose: string) =>
  Buffer.from(
    hkdfSync(
      'sha256',
      config.PAYOUT_DETAILS_SECRET || config.JWT_SECRET,
      '1More payout destinations',
      purpose,
      32,
    ),
  );
const fingerprint = (input: Destination) =>
  createHmac('sha256', key('lookup-v1'))
    .update(
      input.kind === 'UPI'
        ? input.vpa
        : [input.ifsc, input.account_number, input.name.toLowerCase()].join(
            ':',
          ),
    )
    .digest('hex');
const encrypt = (input: Destination, owner: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key('encrypt-v1'), iv);
  cipher.setAAD(Buffer.from(owner));
  return Buffer.concat([
    iv,
    cipher.update(JSON.stringify(input)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64url');
};
const decrypt = (value: string, owner: string) => {
  const bytes = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key('encrypt-v1'),
    bytes.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(bytes.subarray(-16));
  return destination_input.parse(
    JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(12, -16)),
        decipher.final(),
      ]).toString('utf8'),
    ),
  );
};

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

  get credentials_ready() {
    return razorpay_x_credentials_ready();
  }

  async list(driver_id: string) {
    await this.db.client.$transaction((tx) =>
      require_driver_wallet_access(tx, driver_id),
    );
    const rows = await this.db.client.driverPayoutMethod.findMany({
      where: { driver_id, status: { not: 'DISABLED' } },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      take: 10,
    });
    return {
      upi_enabled: true,
      bank_account_enabled: true,
      debit_card_enabled: false,
      rows: rows.map(present),
    };
  }

  async setup(driver_id: string, input: Destination) {
    const destination_hash = fingerprint(input);
    const masked_label =
      input.kind === 'UPI'
        ? mask_vpa(input.vpa)
        : `Bank account •••• ${input.account_number.slice(-4)}${input.kind === 'DEBIT_CARD' ? ` · Card •••• ${input.card_last_four}` : ''}`;
    return this.db.client.$transaction(async (tx) => {
      await require_driver_wallet_access(tx, driver_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${payout_schedule_lock}::int)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720068, hashtext(${driver_id}))`;
      const existing = await tx.driverPayoutMethod.findFirst({
        where: {
          driver_id,
          status: { not: 'DISABLED' },
          destination_hash:
            input.kind === 'UPI'
              ? { in: [destination_hash, vpa_hash(input.vpa)] }
              : destination_hash,
        },
        orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      });
      const already_linked =
        existing?.status === 'VERIFIED' && existing.provider_fund_account_id;
      const data = {
        kind: input.kind,
        masked_label,
        destination_hash,
        is_default: true,
        ...(!already_linked
          ? {
              status: 'PENDING' as const,
              pending_details: encrypt(input, driver_id),
              link_attempted_at: null,
            }
          : {}),
      };
      await tx.driverPayoutMethod.updateMany({
        where: {
          driver_id,
          is_default: true,
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        data: { is_default: false },
      });
      return present(
        existing
          ? await tx.driverPayoutMethod.update({
              where: { id: existing.id },
              data,
            })
          : await tx.driverPayoutMethod.create({
              data: { ...data, driver_id },
            }),
      );
    });
  }

  async set_default(driver_id: string, id: string) {
    return this.db.client.$transaction(async (tx) => {
      await require_driver_wallet_access(tx, driver_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${payout_schedule_lock}::int)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720068, hashtext(${driver_id}))`;
      const method = await tx.driverPayoutMethod.findFirst({
        where: {
          id,
          driver_id,
          OR: [
            { status: 'VERIFIED', provider_fund_account_id: { not: null } },
            { status: 'PENDING', pending_details: { not: null } },
          ],
        },
      });
      if (!method)
        throw new AppError(
          404,
          'PAYOUT_METHOD_NOT_FOUND',
          'Save this payout account again.',
        );
      await tx.driverPayoutMethod.updateMany({
        where: { driver_id, is_default: true, id: { not: id } },
        data: { is_default: false },
      });
      return present(
        await tx.driverPayoutMethod.update({
          where: { id },
          data: { is_default: true, link_attempted_at: null },
        }),
      );
    });
  }

  async provision(row: DriverPayoutMethod) {
    if (!row.pending_details || !this.credentials_ready) return present(row);
    const can_retry = new Date(Date.now() - 5 * 60_000);
    const claim = await this.db.client.driverPayoutMethod.updateMany({
      where: {
        id: row.id,
        status: 'PENDING',
        is_default: true,
        pending_details: row.pending_details,
        OR: [
          { link_attempted_at: null },
          { link_attempted_at: { lt: can_retry } },
        ],
      },
      data: { link_attempted_at: new Date() },
    });
    if (!claim.count) return present(row);
    let input: Destination;
    try {
      input = decrypt(row.pending_details, row.driver_id);
    } catch {
      throw unavailable();
    }
    const contact =
      row.provider_contact_id ||
      (await this.request('/contacts', contact_schema, {
        name: input.name,
        type: 'vendor',
        reference_id: row.driver_id,
      }).then((contact) => {
        if (contact.reference_id !== row.driver_id) throw unavailable();
        return contact.id;
      }));
    const fund = await this.request(
      '/fund_accounts',
      fund_schema,
      input.kind === 'UPI'
        ? {
            contact_id: contact,
            account_type: 'vpa',
            vpa: { address: input.vpa },
          }
        : {
            contact_id: contact,
            account_type: 'bank_account',
            bank_account: {
              name: input.name,
              ifsc: input.ifsc,
              account_number: input.account_number,
            },
          },
    );
    if (
      fund.contact_id !== contact ||
      !(input.kind === 'UPI'
        ? fund.account_type === 'vpa' &&
          fund.vpa.address.toLowerCase() === input.vpa
        : fund.account_type === 'bank_account' &&
          fund.bank_account.ifsc === input.ifsc &&
          fund.bank_account.account_number === input.account_number)
    )
      throw unavailable();
    await this.db.client.driverPayoutMethod.updateMany({
      where: {
        id: row.id,
        pending_details: row.pending_details,
        status: 'PENDING',
        is_default: true,
      },
      data: {
        status: 'VERIFIED',
        provider_fund_account_id: fund.id,
        provider_contact_id: contact,
        pending_details: null,
        link_attempted_at: null,
      },
    });
    return present(
      await this.db.client.driverPayoutMethod.findUniqueOrThrow({
        where: { id: row.id },
      }),
    );
  }

  async check(driver_id: string, id: string) {
    await this.db.client.$transaction((tx) =>
      require_driver_wallet_access(tx, driver_id),
    );
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
    if (row.pending_details) return this.provision(row);
    if (
      !this.credentials_ready ||
      !(await read_wallet_controls(this.db.client)).razorpay_x_upi_setup_enabled
    )
      throw unavailable();
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
      await require_driver_wallet_access(tx, row.driver_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720068, hashtext(${row.driver_id}))`;
      const current = await tx.driverPayoutMethod.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (current.status !== 'PENDING' || current.pending_details)
        return present(current);
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
            OR: [
              { created_at: { gt: current.created_at } },
              { pending_details: { not: null } },
            ],
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
    selectable: Boolean(
      row.pending_details ||
      (row.provider_fund_account_id && row.status === 'VERIFIED'),
    ),
  };
}
