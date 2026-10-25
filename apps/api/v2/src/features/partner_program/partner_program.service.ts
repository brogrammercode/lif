import { pending_application_page } from '../admin_pending/pending.list.js';
import { queue_partner_email } from '../../infra/mail/partner_email.js';
import { schedule_new_user_emails } from '../../infra/mail/new_user_email.js';
import { LIVE_SELFIE, LIVE_SELFIE_ID } from './partner_selfie.constant.js';
import { claimable_delivery } from './partner_delivery.constant.js';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { TransactionClient } from '../../infra/database/client.js';
import {
  require_active_account,
  require_active_admin,
} from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { convert_image_to_webp } from '../../infra/media/image_transform.js';
import { image_upload_schema } from '../../infra/media/image_upload.js';
import { AppError } from '../../core/error.js';
import { published_document } from './partner_document.service.js';
import {
  matches_activation,
  partner_lock,
  reveal_activation,
} from './partner_program.security.js';
import type {
  ApplicationInput,
  AssetInput,
  ConfirmationInput,
  ListInput,
  ReviewInput,
} from './partner_program.type.js';
import {
  field_value_error,
  address_values_error,
  normalize_field_value,
  with_field_rules,
} from './partner_field.rules.js';

const transaction_options = { maxWait: 10000, timeout: 30000 };
const asset_select = {
  id: true,
  owner_id: true,
  purpose: true,
  field_id: true,
  file_name: true,
  mime_type: true,
  size: true,
  created_at: true,
} as const;
const application_include = {
  fields: { orderBy: { created_at: 'asc' as const } },
  confirmation: true,
  exit_request: { select: { id: true, status: true, version: true } },
  deliveries: true,
  user: {
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone_e164: true,
      role: true,
      last_login_at: true,
      partner_activated_at: true,
    },
  },
} as const;
type Application = Prisma.PartnerApplicationGetPayload<{
  include: typeof application_include;
}>;
type Definition = {
  id: string;
  key?: string;
  label: string;
  field_type: string;
  is_required: boolean;
  category?: { name: string; sort_order?: number };
  sort_order?: number;
  min_value?: number | null;
  max_value?: number | null;
  max_length?: number | null;
  allow_multiple?: boolean;
  max_file_size_mb?: number | null;
  allowed_extensions?: string[];
};
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const definition_order = (left: Definition, right: Definition) =>
  (left.id === LIVE_SELFIE_ID ? 1 : 0) -
    (right.id === LIVE_SELFIE_ID ? 1 : 0) ||
  (left.category?.sort_order ?? 0) - (right.category?.sort_order ?? 0) ||
  (left.category?.name ?? '').localeCompare(right.category?.name ?? '') ||
  (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
  left.id.localeCompare(right.id);
const empty = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);
const conflict = () =>
  new AppError(
    409,
    'APPLICATION_CHANGED',
    'This application changed. Refresh it before continuing.',
  );
const fail = (message: string) =>
  new AppError(422, 'PARTNER_VALIDATION_ERROR', message);
const safe_application = (app: Application | null) => {
  if (!app) return null;
  const { activation_hash, activation_salt, activation_ciphertext, ...safe } =
    app;
  void activation_hash;
  void activation_salt;
  void activation_ciphertext;
  return safe;
};

@Injectable()
export class PartnerProgramService {
  constructor(private readonly database: PrismaService) {}
  private async audit(
    tx: TransactionClient,
    actor_id: string,
    id: string,
    action: string,
    data: unknown = {},
  ) {
    await create_user_log(tx, {
      actor_id,
      entity_type: 'PartnerApplication',
      entity_id: id,
      action,
      after_data: json(data) as Prisma.InputJsonObject,
    });
  }
  private async mail_transaction<T>(
    work: (tx: TransactionClient) => Promise<T>,
    options = transaction_options,
  ): Promise<T> {
    const result = await this.database.client.$transaction(work, options);
    schedule_new_user_emails();
    return result;
  }
  private async notify(
    tx: TransactionClient,
    user_id: string,
    title: string,
    body: string,
  ) {
    await tx.notification.create({
      data: {
        user_id,
        type: 'ACCOUNT',
        channel: 'IN_APP',
        title,
        body,
        data: { route: '/partner-program' },
      },
    });
    const app = await tx.partnerApplication.findUnique({
      where: { user_id },
      select: {
        id: true,
        user_id: true,
        contact_email: true,
        version: true,
        status: true,
      },
    });
    if (app) await queue_partner_email(tx, app, 'STATUS_UPDATED', title, body);
  }
  private async locked(
    tx: TransactionClient,
    actor_id: string,
    id: string,
    version: number,
    admin = true,
  ) {
    if (admin) await require_active_admin(tx, actor_id);
    else await require_active_account(tx, actor_id);
    const initial = await tx.partnerApplication.findUnique({
      where: { id },
      select: { user_id: true },
    });
    if (!initial || (!admin && initial.user_id !== actor_id))
      throw new AppError(
        404,
        'APPLICATION_NOT_FOUND',
        'Application not found.',
      );
    await require_active_account(tx, initial.user_id);
    await partner_lock(tx, initial.user_id);
    const app = await tx.partnerApplication.findUnique({
      where: { id },
      include: application_include,
    });
    if (!app || app.version !== version) throw conflict();
    return app;
  }
  async workflow(user_id: string) {
    const [app, policy, confirmation, requirements, assets] = await Promise.all(
      [
        this.database.client.partnerApplication.findUnique({
          where: { user_id },
          include: application_include,
        }),
        this.database.client.partnerDocument.findUnique({
          where: { kind: 'POLICY' },
        }),
        this.database.client.partnerDocument.findUnique({
          where: { kind: 'CONFIRMATION' },
        }),
        this.database.client.partnerRequirement.findMany({
          where: { is_active: true, category: { is_active: true } },
          include: { category: true },
          orderBy: [
            { category: { sort_order: 'asc' } },
            { sort_order: 'asc' },
            { id: 'asc' },
          ],
        }),
        this.database.client.partnerAsset.findMany({
          where: { owner_id: user_id },
          select: asset_select,
          orderBy: { created_at: 'desc' },
        }),
      ],
    );
    return {
      application: app
        ? {
            id: app.id,
            status: app.status,
            version: app.version,
            contact_email: app.contact_email,
            whatsapp_phone: app.whatsapp_phone,
            submitted_at: app.submitted_at,
            completed_at: app.completed_at,
            final_pdf_id: app.final_pdf_id,
            fields: app.fields.map((field) => ({
              id: field.id,
              requirement_id: field.requirement_id,
              value: field.value,
              status: field.status,
              rejection_reason: field.rejection_reason,
            })),
            confirmation: app.confirmation
              ? {
                  signature_name: app.confirmation.signature_name,
                  status: app.confirmation.status,
                  rejection_reason: app.confirmation.rejection_reason,
                  accepted_at: app.confirmation.accepted_at,
                }
              : null,
          }
        : null,
      policy: app?.policy_snapshot ?? published_document(policy),
      confirmation:
        app?.confirmation_document ?? published_document(confirmation),
      requirements: app
        ? [
            ...app.fields
              .map((f) => f.definition as unknown as Definition)
              .sort(definition_order)
              .map(with_field_rules),
            ...(['SUBMITTED', 'CHANGES_REQUESTED'].includes(app.status) &&
            !app.fields.some((f) => f.requirement_id === LIVE_SELFIE_ID)
              ? [LIVE_SELFIE]
              : []),
          ]
        : [
            ...requirements.sort(definition_order).map(with_field_rules),
            LIVE_SELFIE,
          ],
      assets,
      activation_required:
        app?.status === 'COMPLETED' && !!app.activation_issued_at,
      driver_active: app?.status === 'ACTIVATED',
    };
  }
  async list(input: ListInput) {
    schedule_new_user_emails();
    const pending =
      input.pending_only === 'true'
        ? await pending_application_page(this.database.client, input)
        : null;
    const where: Prisma.PartnerApplicationWhereInput = {
      ...(input.status === 'all' ? {} : { status: input.status }),
      ...(input.section === 'confirmations' && input.pending_only !== 'true'
        ? { confirmation: { isNot: null } }
        : {}),
      ...(input.query
        ? {
            OR: [
              { id: { contains: input.query } },
              { contact_email: { contains: input.query, mode: 'insensitive' } },
              { whatsapp_phone: { contains: input.query } },
              {
                user: {
                  first_name: { contains: input.query, mode: 'insensitive' },
                },
              },
              {
                user: {
                  last_name: { contains: input.query, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    if (pending) Object.assign(where, { id: { in: pending.ids } });
    const total =
      pending?.total ??
      (await this.database.client.partnerApplication.count({
        where,
      }));
    const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
    const rows = await this.database.client.partnerApplication.findMany({
      where,
      select: {
        id: true,
        user_id: true,
        status: true,
        version: true,
        contact_email: true,
        whatsapp_phone: true,
        submitted_at: true,
        completed_at: true,
        activation_issued_at: true,
        activation_attempts: true,
        user: {
          select: { first_name: true, last_name: true, avatar_url: true },
        },
        confirmation: { select: { status: true, accepted_at: true } },
        deliveries: true,
      },
      orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
      skip: pending ? 0 : (page - 1) * 20,
      take: 20,
    });
    return { rows, total, page, page_size: 20 };
  }
  async detail(id: string) {
    const app = await this.database.client.partnerApplication.findUnique({
      where: { id },
      include: application_include,
    });
    if (!app)
      throw new AppError(
        404,
        'APPLICATION_NOT_FOUND',
        'Application not found.',
      );
    const assets = await this.database.client.partnerAsset.findMany({
      where: { owner_id: app.user_id },
      select: asset_select,
    });
    const emails = await this.database.client.notification.findMany({
      where: {
        channel: 'EMAIL',
        sent_at: undefined,
        data: { path: ['application_id'], equals: id },
      },
      select: { id: true, data: true, created_at: true, sent_at: true },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return {
      application: safe_application(app),
      assets,
      emails: emails.map((row) => {
        const data = row.data as Prisma.JsonObject;
        return {
          id: row.id,
          event: data.event,
          status: data.state,
          attempts: data.attempts,
          last_error: data.last_error ?? null,
          created_at: row.created_at,
          sent_at: row.sent_at,
        };
      }),
    };
  }
  private async validate_answer(
    tx: TransactionClient,
    user_id: string,
    definition: Definition,
    value: unknown,
    validate_semantics = true,
    cached_assets?: {
      id: string;
      field_id: string | null;
      purpose: string;
      mime_type: string;
      file_name: string;
      size: number;
    }[],
  ) {
    const label = definition.label;
    if (empty(value)) {
      if (definition.is_required) throw fail(`${label} is required.`);
      return;
    }
    const field_error = validate_semantics
      ? field_value_error(definition, value)
      : null;
    if (field_error) throw fail(field_error);
    if (['FILE', 'IMAGE', 'PDF'].includes(definition.field_type)) {
      if (
        !Array.isArray(value) ||
        value.some((id) => typeof id !== 'string') ||
        value.length > (definition.allow_multiple ? 10 : 1)
      )
        throw fail(`Choose valid files for ${label}.`);
      const purpose =
        definition.id === LIVE_SELFIE_ID
          ? 'APPLICATION_SELFIE'
          : 'APPLICATION_DOCUMENT';
      const assets = cached_assets
        ? cached_assets.filter(
            (asset) =>
              value.includes(asset.id) &&
              asset.field_id === definition.id &&
              asset.purpose === purpose,
          )
        : await tx.partnerAsset.findMany({
            where: {
              id: { in: value as string[] },
              owner_id: user_id,
              purpose:
                definition.id === LIVE_SELFIE_ID
                  ? 'APPLICATION_SELFIE'
                  : 'APPLICATION_DOCUMENT',
              field_id: definition.id,
            },
            select: { id: true, mime_type: true, file_name: true, size: true },
          });
      if (
        assets.length !== new Set(value).size ||
        new Set(value).size !== value.length
      )
        throw fail(`Upload the files for ${label} again.`);
      if (
        assets.some((a) =>
          definition.field_type === 'PDF'
            ? a.mime_type !== 'application/pdf'
            : definition.field_type === 'IMAGE'
              ? !a.mime_type.startsWith('image/')
              : false,
        )
      )
        throw fail(`Wrong file type for ${label}.`);
      const allowed =
        definition.allowed_extensions?.map(
          (extension) => '.' + extension.replace(/^\./, '').toLowerCase(),
        ) ?? [];
      if (
        assets.some(
          (asset) =>
            asset.size >
            Math.min(
              3_000_000,
              (definition.max_file_size_mb ?? 3) * 1024 * 1024,
            ),
        )
      )
        throw fail(
          `The file for ${label} exceeds its size limit. Upload a smaller file.`,
        );
      if (
        allowed.length &&
        assets.some((asset) => {
          // Accepted images are centrally normalized to WebP, including JPEG/PNG inputs.
          if (
            asset.mime_type === 'image/webp' &&
            allowed.some((extension) =>
              ['.jpg', '.jpeg', '.png', '.webp'].includes(extension),
            )
          )
            return false;
          const extension =
            '.' + (asset.file_name.split('.').pop()?.toLowerCase() ?? '');
          return !allowed.includes(extension);
        })
      )
        throw fail(
          `The file types for ${label} changed. Upload a permitted file.`,
        );
    } else if (definition.field_type === 'NUMBER') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (definition.min_value != null && value < definition.min_value) ||
        (definition.max_value != null && value > definition.max_value)
      )
        throw fail(`Enter a number within the configured limits for ${label}.`);
    } else if (definition.field_type === 'BOOLEAN') {
      if (typeof value !== 'boolean')
        throw fail(`Choose yes or no for ${label}.`);
    } else {
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > (definition.max_length ?? 10000)
      )
        throw fail(`Enter a valid value for ${label}.`);
      if (definition.field_type === 'DATE') {
        const date = new Date(value + 'T00:00:00Z');
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value
        )
          throw fail(`Choose a valid date for ${label}.`);
      }
    }
  }
  async submit(user_id: string, input: ApplicationInput) {
    return this.mail_transaction(async (tx) => {
      const user = await require_active_account(tx, user_id);
      await partner_lock(tx, user_id);
      // Staff use the same personal account in the rider app. Their staff role
      // must not prevent onboarding or be replaced by a driver role later.
      if (user.role === 'DRIVER')
        throw new AppError(
          403,
          'PARTNER_NOT_ELIGIBLE',
          'This account is already a driver and cannot submit a new partner application.',
        );
      const old = await tx.partnerApplication.findUnique({
        where: { user_id },
        include: application_include,
      });
      if ((old?.version ?? 0) !== input.version) throw conflict();
      if (old && !['SUBMITTED', 'CHANGES_REQUESTED'].includes(old.status))
        throw conflict();
      const published = published_document(
        await tx.partnerDocument.findUnique({ where: { kind: 'POLICY' } }),
      );
      const policy = (old?.policy_snapshot ?? published) as {
        version: number;
      } | null;
      if (!policy || policy.version !== input.policy_version)
        throw new AppError(
          409,
          'POLICY_CHANGED',
          'Read and accept the latest published policy before submitting.',
        );
      const definitions: Definition[] = old
        ? old.fields.map((f) => f.definition as unknown as Definition)
        : await tx.partnerRequirement.findMany({
            where: { is_active: true, category: { is_active: true } },
            include: { category: true },
            orderBy: [
              { category: { sort_order: 'asc' } },
              { sort_order: 'asc' },
              { id: 'asc' },
            ],
          });
      if (!definitions.some((d) => d.id === LIVE_SELFIE_ID))
        definitions.push({
          ...LIVE_SELFIE,
          allowed_extensions: [...LIVE_SELFIE.allowed_extensions],
        });
      const values = new Map(
        input.answers.map((a) => {
          const definition = definitions.find((d) => d.id === a.requirement_id);
          const approved = old?.fields.some(
            (f) =>
              f.requirement_id === a.requirement_id && f.status === 'APPROVED',
          );
          return [
            a.requirement_id,
            definition && !approved
              ? normalize_field_value(definition, a.value)
              : a.value,
          ] as const;
        }),
      );
      if (
        values.size !== input.answers.length ||
        input.answers.some(
          (a) => !definitions.some((d) => d.id === a.requirement_id),
        )
      )
        throw fail('The form contains unknown or duplicate fields.');
      // One bounded metadata query for the whole submission. Never load file
      // contents or issue a query per document while holding the transaction.
      for (const d of definitions.filter((d) =>
        ['FILE', 'IMAGE', 'PDF'].includes(d.field_type),
      )) {
        const value = values.get(d.id);
        if (Array.isArray(value) && value.length > (d.allow_multiple ? 10 : 1))
          throw fail('Choose valid files for ' + d.label + '.');
      }
      const asset_ids = [
        ...new Set(
          definitions
            .filter((d) => ['FILE', 'IMAGE', 'PDF'].includes(d.field_type))
            .flatMap((d) => {
              const value = values.get(d.id);
              return Array.isArray(value)
                ? value.filter((id): id is string => typeof id === 'string')
                : [];
            }),
        ),
      ];
      const cached_assets = asset_ids.length
        ? await tx.partnerAsset.findMany({
            where: { owner_id: user_id, id: { in: asset_ids } },
            select: {
              id: true,
              field_id: true,
              purpose: true,
              mime_type: true,
              file_name: true,
              size: true,
            },
          })
        : [];
      for (const definition of definitions) {
        const value = values.get(definition.id) ?? null;
        const previous = old?.fields.find(
          (f) => f.requirement_id === definition.id,
        );
        await this.validate_answer(
          tx,
          user_id,
          definition,
          value,
          previous?.status !== 'APPROVED',
          cached_assets,
        );
        if (
          previous?.status === 'APPROVED' &&
          JSON.stringify(previous.value) !== JSON.stringify(value)
        )
          throw fail(`${definition.label} was approved and cannot be changed.`);
        if (
          previous?.status === 'REJECTED' &&
          JSON.stringify(previous.value) === JSON.stringify(value)
        )
          throw fail(`Correct ${definition.label} before resubmitting.`);
      }
      const address_error = address_values_error(
        definitions,
        values,
        new Set(
          old?.fields
            .filter((field) => field.status === 'APPROVED')
            .map((field) => field.requirement_id) ?? [],
        ),
      );
      if (address_error) throw fail(address_error);
      const app = old
        ? await tx.partnerApplication.update({
            where: { id: old.id },
            data: {
              status: 'SUBMITTED',
              contact_email: input.contact_email,
              whatsapp_phone: input.whatsapp_phone,
              version: { increment: 1 },
              submitted_at: new Date(),
            },
          })
        : await tx.partnerApplication.create({
            data: {
              user_id,
              contact_email: input.contact_email,
              whatsapp_phone: input.whatsapp_phone,
              policy_snapshot: json(policy),
            },
          });
      if (!old && definitions.length) {
        await tx.partnerApplicationField.createMany({
          data: definitions.map((definition) => {
            const value = values.get(definition.id) ?? null;
            return {
              application_id: app.id,
              requirement_id: definition.id,
              definition: json(definition),
              value: value === null ? Prisma.JsonNull : json(value),
            };
          }),
        });
      }
      for (const definition of old ? definitions : []) {
        const value = values.get(definition.id) ?? null;
        const previous = old?.fields.find(
          (f) => f.requirement_id === definition.id,
        );
        if (
          previous?.status === 'APPROVED' ||
          (previous?.status === 'PENDING' &&
            JSON.stringify(previous.value) === JSON.stringify(value))
        )
          continue;
        await tx.partnerApplicationField.upsert({
          where: {
            application_id_requirement_id: {
              application_id: app.id,
              requirement_id: definition.id,
            },
          },
          create: {
            application_id: app.id,
            requirement_id: definition.id,
            definition: json(definition),
            value: value === null ? Prisma.JsonNull : json(value),
          },
          update: {
            value: value === null ? Prisma.JsonNull : json(value),
            status: 'PENDING',
            rejection_reason: null,
            reviewed_at: null,
            reviewed_by_id: null,
          },
        });
      }
      await this.audit(
        tx,
        user_id,
        app.id,
        old ? 'RESUBMIT_PARTNER_APPLICATION' : 'SUBMIT_PARTNER_APPLICATION',
        { version: app.version },
      );
      await queue_partner_email(
        tx,
        app,
        old ? 'APPLICATION_RESUBMITTED' : 'APPLICATION_SUBMITTED',
        old ? 'Partner application resubmitted' : 'New partner application',
        'A partner application from ' +
          app.contact_email +
          ' is ready for review.',
        true,
      );
      await queue_partner_email(
        tx,
        app,
        'APPLICATION_RECEIVED',
        'We received your partner application',
        'Your application is saved and awaiting review. You can track each field and any requested corrections in the app.',
      );
      return { id: app.id, version: app.version, status: app.status };
    }, transaction_options);
  }
  async review_field(
    actor_id: string,
    id: string,
    field_id: string,
    input: ReviewInput,
  ) {
    return this.mail_transaction(async (tx) => {
      const app = await this.locked(tx, actor_id, id, input.version);
      if (!['SUBMITTED', 'CHANGES_REQUESTED'].includes(app.status))
        throw conflict();
      const field = app.fields.find((f) => f.id === field_id);
      if (!field)
        throw new AppError(
          404,
          'FIELD_NOT_FOUND',
          'Submitted field not found.',
        );
      if (input.decision === 'APPROVED')
        await this.validate_answer(
          tx,
          app.user_id,
          field.definition as unknown as Definition,
          field.value,
        );
      await tx.partnerApplicationField.update({
        where: { id: field_id },
        data: {
          status: input.decision,
          rejection_reason:
            input.decision === 'REJECTED' ? input.rejection_reason! : null,
          reviewed_at: new Date(),
          reviewed_by_id: actor_id,
        },
      });
      const rejected =
        input.decision === 'REJECTED' ||
        app.fields.some((f) => f.id !== field_id && f.status === 'REJECTED');
      const updated = await tx.partnerApplication.update({
        where: { id },
        data: {
          status: rejected ? 'CHANGES_REQUESTED' : 'SUBMITTED',
          version: { increment: 1 },
        },
      });
      await this.audit(tx, actor_id, id, 'REVIEW_PARTNER_FIELD', {
        field_id,
        status: input.decision,
        reason: input.rejection_reason,
      });
      if (input.decision === 'REJECTED')
        await this.notify(
          tx,
          app.user_id,
          'Partner application needs a correction',
          `${(field.definition as unknown as Definition).label}: ${input.rejection_reason}`,
        );
      return { version: updated.version, status: updated.status };
    }, transaction_options);
  }
  async request_selfie(actor_id: string, id: string, version: number) {
    return this.mail_transaction(async (tx) => {
      const app = await this.locked(tx, actor_id, id, version);
      if (
        !['SUBMITTED', 'CHANGES_REQUESTED'].includes(app.status) ||
        app.fields.some((f) => f.requirement_id === LIVE_SELFIE_ID)
      )
        throw conflict();
      await tx.partnerApplicationField.create({
        data: {
          application_id: id,
          requirement_id: LIVE_SELFIE_ID,
          definition: json(LIVE_SELFIE),
          value: Prisma.JsonNull,
          status: 'REJECTED',
          rejection_reason:
            'Take a fresh live selfie and resubmit your application.',
          reviewed_by_id: actor_id,
          reviewed_at: new Date(),
        },
      });
      await tx.partnerApplication.update({
        where: { id },
        data: { status: 'CHANGES_REQUESTED', version: { increment: 1 } },
      });
      await this.audit(tx, actor_id, id, 'REQUEST_PARTNER_SELFIE');
      await this.notify(
        tx,
        app.user_id,
        'Live selfie required',
        'Take a fresh selfie in your Partner Program application and resubmit. Approved fields are preserved.',
      );
      return { requested: true };
    }, transaction_options);
  }
  async approve_application(actor_id: string, id: string, input: ReviewInput) {
    return this.mail_transaction(async (tx) => {
      const app = await this.locked(tx, actor_id, id, input.version);
      if (
        !['SUBMITTED', 'CHANGES_REQUESTED'].includes(app.status) ||
        input.decision !== 'APPROVED'
      )
        throw conflict();
      if (!app.fields.some((f) => f.requirement_id === LIVE_SELFIE_ID))
        throw fail(
          'Request and approve a live selfie before approving this application.',
        );
      if (
        app.fields.some(
          (f) =>
            ((f.definition as unknown as Definition).is_required &&
              empty(f.value)) ||
            f.status === 'REJECTED' ||
            (((f.definition as unknown as Definition).is_required ||
              !empty(f.value)) &&
              f.status !== 'APPROVED'),
        )
      )
        throw fail(
          'Approve every required or provided field before approving the application.',
        );
      const selfie = app.fields.find(
        (f) => f.requirement_id === LIVE_SELFIE_ID,
      )!;
      await this.validate_answer(
        tx,
        app.user_id,
        {
          ...LIVE_SELFIE,
          allowed_extensions: [...LIVE_SELFIE.allowed_extensions],
        },
        selfie.value,
      );
      const confirmation = published_document(
        await tx.partnerDocument.findUnique({
          where: { kind: 'CONFIRMATION' },
        }),
      );
      if (!confirmation)
        throw fail('Publish the confirmation document in Requirements first.');
      const approval_before = { status: app.status, version: app.version };
      const updated = await tx.partnerApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          confirmation_document: json(confirmation),
          reviewed_by_id: actor_id,
          reviewed_at: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit(tx, actor_id, id, 'APPROVE_PARTNER_APPLICATION', {
        previous_status: approval_before.status,
        status: updated.status,
        previous_version: approval_before.version,
        version: updated.version,
      });
      await this.notify(
        tx,
        app.user_id,
        'Partner application approved',
        'Read and submit your partner confirmation to continue.',
      );
      return { version: updated.version, status: updated.status };
    }, transaction_options);
  }
  async confirm(user_id: string, input: ConfirmationInput) {
    return this.mail_transaction(async (tx) => {
      const found = await tx.partnerApplication.findUnique({
        where: { user_id },
        select: { id: true },
      });
      if (!found) throw fail('Submit an application first.');
      const app = await this.locked(
        tx,
        user_id,
        found.id,
        input.version,
        false,
      );
      if (!['APPROVED', 'CONFIRMATION_CHANGES_REQUESTED'].includes(app.status))
        throw conflict();
      const document = app.confirmation_document as { version?: number } | null;
      if (!document || document.version !== input.document_version)
        throw conflict();
      await tx.partnerConfirmation.upsert({
        where: { application_id: app.id },
        create: {
          application_id: app.id,
          document_snapshot: json(document),
          signature_name: input.signature_name,
        },
        update: {
          document_snapshot: json(document),
          signature_name: input.signature_name,
          accepted_at: new Date(),
          status: 'PENDING',
          rejection_reason: null,
          reviewed_at: null,
          reviewed_by_id: null,
        },
      });
      const updated = await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: 'CONFIRMATION_SUBMITTED', version: { increment: 1 } },
      });
      await queue_partner_email(
        tx,
        { ...app, version: updated.version, status: updated.status },
        'CONFIRMATION_SUBMITTED',
        'Partner confirmation ready for review',
        'A confirmation from ' + app.contact_email + ' is ready for review.',
        true,
      );
      await this.audit(tx, user_id, app.id, 'SUBMIT_PARTNER_CONFIRMATION', {
        document_version: input.document_version,
        signature_name: input.signature_name,
      });
      return { version: updated.version, status: updated.status };
    }, transaction_options);
  }
  async review_confirmation(actor_id: string, id: string, input: ReviewInput) {
    return this.mail_transaction(async (tx) => {
      const app = await this.locked(tx, actor_id, id, input.version);
      if (app.status !== 'CONFIRMATION_SUBMITTED' || !app.confirmation)
        throw conflict();
      if (input.decision === 'APPROVED') {
        const pdf = input.final_pdf_id
          ? await tx.partnerAsset.findFirst({
              where: {
                id: input.final_pdf_id,
                owner_id: app.user_id,
                purpose: 'FINAL_PDF',
                mime_type: 'application/pdf',
              },
              select: { id: true },
            })
          : null;
        if (!pdf) throw fail('Upload and select the final approved PDF first.');
      }
      await tx.partnerConfirmation.update({
        where: { id: app.confirmation.id },
        data: {
          status: input.decision,
          rejection_reason:
            input.decision === 'REJECTED' ? input.rejection_reason! : null,
          reviewed_by_id: actor_id,
          reviewed_at: new Date(),
        },
      });
      const approved = input.decision === 'APPROVED';
      const updated = await tx.partnerApplication.update({
        where: { id },
        data: {
          status: approved ? 'COMPLETED' : 'CONFIRMATION_CHANGES_REQUESTED',
          ...(approved
            ? { final_pdf_id: input.final_pdf_id!, completed_at: new Date() }
            : {}),
          version: { increment: 1 },
        },
      });
      if (approved)
        for (const channel of ['EMAIL', 'WHATSAPP'])
          await tx.partnerDelivery.upsert({
            where: { application_id_channel: { application_id: id, channel } },
            create: {
              application_id: id,
              channel,
              status: channel === 'EMAIL' ? 'PENDING' : 'MANUAL_PENDING',
            },
            update: {},
          });
      await this.audit(tx, actor_id, id, 'REVIEW_PARTNER_CONFIRMATION', {
        decision: input.decision,
        final_pdf_id: input.final_pdf_id,
        reason: input.rejection_reason,
      });
      await this.notify(
        tx,
        app.user_id,
        approved
          ? 'Welcome to the Partner Program'
          : 'Partner confirmation needs a correction',
        approved
          ? 'Your final PDF is ready. Sign out and sign in again to activate your driver account.'
          : input.rejection_reason!,
      );
      return { version: updated.version, status: updated.status };
    }, transaction_options);
  }
  async store_asset(actor_id: string, input: AssetInput, admin = false) {
    if (!admin && input.application_id)
      throw fail(
        'Application uploads must identify a requirement, not another application.',
      );
    const app = input.application_id
      ? await this.database.client.partnerApplication.findUnique({
          where: { id: input.application_id },
          select: { user_id: true, status: true },
        })
      : null;
    const owner_id = admin ? app?.user_id : actor_id;
    if (!owner_id)
      throw fail('Select an application before uploading its final PDF.');
    let definition: Definition | null = null;
    if (!admin) {
      if (!input.field_id)
        throw fail('Choose the requirement this upload belongs to.');
      if (
        input.field_id === LIVE_SELFIE_ID &&
        input.capture_source !== 'CAMERA'
      )
        throw fail('Take your live selfie using the application camera.');
      const existing = await this.database.client.partnerApplication.findUnique(
        { where: { user_id: actor_id }, include: { fields: true } },
      );
      if (
        existing &&
        !['SUBMITTED', 'CHANGES_REQUESTED'].includes(existing.status)
      )
        throw conflict();
      const previous = existing?.fields.find(
        (f) => f.requirement_id === input.field_id,
      );
      if (previous?.status === 'APPROVED')
        throw fail('This field is already approved.');
      definition = previous
        ? (previous.definition as unknown as Definition)
        : input.field_id === LIVE_SELFIE_ID
          ? {
              ...LIVE_SELFIE,
              allowed_extensions: [...LIVE_SELFIE.allowed_extensions],
            }
          : await this.database.client.partnerRequirement.findFirst({
              where: {
                id: input.field_id,
                is_active: true,
                category: { is_active: true },
              },
            });
      if (
        !definition ||
        !['FILE', 'IMAGE', 'PDF'].includes(definition.field_type)
      )
        throw fail('This field does not accept files.');
    }
    const match =
      /^data:([a-zA-Z0-9.+\/-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        input.data_url,
      );
    if (!match) throw fail('Choose a valid file.');
    let bytes = Buffer.from(match[2]!, 'base64');
    if (
      !bytes.length ||
      bytes.length > 3_000_000 ||
      bytes.toString('base64') !== match[2]
    )
      throw fail('Files must be no larger than 3 MB.');
    if (
      definition?.max_file_size_mb &&
      bytes.length > definition.max_file_size_mb * 1024 * 1024
    )
      throw fail('This file exceeds the field size limit.');
    const extension = input.file_name.split('.').pop()?.toLowerCase() ?? '';
    if (
      definition?.allowed_extensions?.length &&
      !definition.allowed_extensions
        .map((e) => e.replace(/^\./, '').toLowerCase())
        .includes(extension)
    )
      throw fail('This file extension is not allowed for this field.');
    let mime = match[1]!.toLowerCase();
    let name = input.file_name;
    if (mime.startsWith('image/')) {
      const image_mimes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      if (image_mimes[extension] !== mime)
        throw fail('The image extension must match its file type.');
      const image = image_upload_schema.parse({
        file_name: name,
        data_url: input.data_url,
      });
      const webp = await convert_image_to_webp(image);
      bytes = Buffer.from(webp.split(',')[1]!, 'base64');
      mime = 'image/webp';
      name = name.replace(/\.[^.]*$/, '') + '.webp';
    } else if (mime === 'application/pdf') {
      if (extension !== 'pdf' || bytes.subarray(0, 5).toString() !== '%PDF-')
        throw fail('Choose a valid PDF.');
    } else if (['txt', 'csv'].includes(extension)) {
      if (
        bytes.includes(0) ||
        Buffer.from(bytes.toString('utf8'), 'utf8').compare(bytes) !== 0
      )
        throw fail('Choose a valid UTF-8 text file.');
      mime = extension === 'csv' ? 'text/csv' : 'text/plain';
    } else if (
      ['doc', 'xls'].includes(extension) &&
      bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))
    ) {
      mime =
        extension === 'doc' ? 'application/msword' : 'application/vnd.ms-excel';
    } else if (
      ['docx', 'xlsx', 'zip'].includes(extension) &&
      (bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex')) ||
        (extension === 'zip' &&
          bytes.subarray(0, 4).equals(Buffer.from('504b0506', 'hex'))))
    ) {
      mime =
        extension === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : extension === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/zip';
    } else
      throw fail(
        'Supported files: PDF, JPEG, PNG, WebP, TXT, CSV, DOC, DOCX, XLS, XLSX and ZIP.',
      );
    if (admin && mime !== 'application/pdf')
      throw fail('The final document must be a PDF.');
    if (definition?.field_type === 'PDF' && mime !== 'application/pdf')
      throw fail('This field requires a PDF.');
    if (definition?.field_type === 'IMAGE' && !mime.startsWith('image/'))
      throw fail('This field requires an image.');
    if (
      bytes.length >
      Math.min(3_000_000, (definition?.max_file_size_mb ?? 3) * 1024 * 1024)
    )
      throw fail(
        'The converted file exceeds the upload limit. Choose a smaller image.',
      );
    return this.mail_transaction(async (tx) => {
      if (admin) await require_active_admin(tx, actor_id);
      await require_active_account(tx, owner_id);
      await partner_lock(tx, owner_id);
      const current = await tx.partnerApplication.findUnique({
        where: { user_id: owner_id },
        include: { fields: { select: { requirement_id: true, status: true } } },
      });
      if (admin && current?.status !== 'CONFIRMATION_SUBMITTED')
        throw conflict();
      if (
        !admin &&
        current &&
        (!['SUBMITTED', 'CHANGES_REQUESTED'].includes(current.status) ||
          current.fields.some(
            (f) =>
              f.requirement_id === input.field_id && f.status === 'APPROVED',
          ))
      )
        throw conflict();
      const digest = createHash('sha256').update(bytes).digest('hex');
      const duplicate = await tx.partnerAsset.findFirst({
        where: {
          owner_id,
          purpose: admin
            ? 'FINAL_PDF'
            : input.field_id === LIVE_SELFIE_ID
              ? 'APPLICATION_SELFIE'
              : 'APPLICATION_DOCUMENT',
          field_id: admin ? null : input.field_id,
          sha256: digest,
          file_name: name,
        },
        select: asset_select,
      });
      if (duplicate) return duplicate;
      const quota = await tx.partnerAsset.aggregate({
        where: { owner_id },
        _sum: { size: true },
        _count: true,
      });
      if (
        (quota._sum.size ?? 0) + bytes.length > 100_000_000 ||
        quota._count >= 2000
      )
        throw fail(
          'Upload allowance reached. Contact support before adding more files.',
        );
      const asset = await tx.partnerAsset.create({
        data: {
          owner_id,
          purpose: admin
            ? 'FINAL_PDF'
            : input.field_id === LIVE_SELFIE_ID
              ? 'APPLICATION_SELFIE'
              : 'APPLICATION_DOCUMENT',
          field_id: admin ? null : input.field_id,
          file_name: name,
          mime_type: mime,
          size: bytes.length,
          sha256: digest,
          content: Uint8Array.from(bytes),
        },
        select: asset_select,
      });
      await this.audit(
        tx,
        actor_id,
        app ? input.application_id! : owner_id,
        'UPLOAD_PARTNER_ASSET',
        { asset_id: asset.id, purpose: asset.purpose },
      );
      return asset;
    }, transaction_options);
  }
  async asset(actor_id: string, id: string) {
    const [actor, asset] = await Promise.all([
      this.database.client.user.findUnique({
        where: { id: actor_id },
        select: { role: true, status: true, deleted_at: true },
      }),
      this.database.client.partnerAsset.findUnique({ where: { id } }),
    ]);
    if (
      !actor ||
      actor.status !== 'ACTIVE' ||
      actor.deleted_at ||
      !asset ||
      (actor.role !== 'ADMIN' && asset.owner_id !== actor_id)
    )
      throw new AppError(404, 'FILE_NOT_FOUND', 'File not found.');
    if (actor.role !== 'ADMIN' && asset.purpose === 'FINAL_PDF') {
      const app = await this.database.client.partnerApplication.findUnique({
        where: { user_id: actor_id },
        select: { final_pdf_id: true, status: true },
      });
      if (
        app?.final_pdf_id !== id ||
        !['COMPLETED', 'ACTIVATED', 'EXITED'].includes(app.status)
      )
        throw new AppError(404, 'FILE_NOT_FOUND', 'File not found.');
    }
    if (actor.role !== 'ADMIN' && asset.purpose === 'EXIT_PDF') {
      const exit = await this.database.client.partnerExitRequest.findFirst({
        where: {
          settlement_pdf_id: id,
          status: 'COMPLETED',
          application: { user_id: actor_id },
        },
        select: { id: true },
      });
      if (!exit) throw new AppError(404, 'FILE_NOT_FOUND', 'File not found.');
    }
    return asset;
  }
  async mark_activation_shared(actor_id: string, id: string) {
    return this.mail_transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const initial = await tx.partnerApplication.findUnique({
        where: { id },
        select: { user_id: true },
      });
      if (!initial)
        throw new AppError(
          404,
          'APPLICATION_NOT_FOUND',
          'Application not found.',
        );
      await require_active_account(tx, initial.user_id);
      await partner_lock(tx, initial.user_id);
      const app = await tx.partnerApplication.findUnique({ where: { id } });
      if (
        !app ||
        !['COMPLETED', 'ACTIVATED'].includes(app.status) ||
        !app.activation_issued_at
      )
        throw fail(
          'An activation code must be issued before recording its delivery.',
        );
      await tx.partnerDelivery.upsert({
        where: {
          application_id_channel: {
            application_id: id,
            channel: 'ACTIVATION_WHATSAPP',
          },
        },
        create: {
          application_id: id,
          channel: 'ACTIVATION_WHATSAPP',
          status: 'MANUALLY_SHARED',
          sent_at: new Date(),
          attempts: 1,
        },
        update: {
          status: 'MANUALLY_SHARED',
          sent_at: new Date(),
          attempts: { increment: 1 },
        },
      });
      await this.audit(tx, actor_id, id, 'MANUALLY_SHARE_PARTNER_ACTIVATION');
      return { recorded: true };
    }, transaction_options);
  }
  async queue_activation_email(actor_id: string, id: string) {
    return this.mail_transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const initial = await tx.partnerApplication.findUnique({
        where: { id },
        select: { user_id: true },
      });
      if (!initial)
        throw new AppError(
          404,
          'APPLICATION_NOT_FOUND',
          'Application not found.',
        );
      await require_active_account(tx, initial.user_id);
      await partner_lock(tx, initial.user_id);
      const app = await tx.partnerApplication.findUnique({ where: { id } });
      if (
        !app ||
        app.status !== 'COMPLETED' ||
        !app.activation_ciphertext ||
        !app.final_pdf_id
      )
        throw fail(
          'The applicant must sign in after final approval before their activation code can be sent.',
        );
      const existing = await tx.partnerDelivery.findUnique({
        where: {
          application_id_channel: {
            application_id: id,
            channel: 'ACTIVATION_EMAIL',
          },
        },
      });
      if (existing) {
        const queued = await tx.partnerDelivery.updateMany({
          where: {
            id: existing.id,
            OR: [claimable_delivery(), { status: 'SENT' }],
          },
          data: {
            status: 'PENDING',
            last_error: null,
            claimed_at: null,
            sent_at: null,
            provider_id: null,
          },
        });
        if (!queued.count)
          throw new AppError(
            409,
            'EMAIL_ALREADY_SENDING',
            'Activation email is already being sent. Refresh its delivery status.',
          );
      } else {
        await tx.partnerDelivery.create({
          data: { application_id: id, channel: 'ACTIVATION_EMAIL' },
        });
      }
      await this.audit(tx, actor_id, id, 'QUEUE_PARTNER_ACTIVATION_EMAIL');
      return { queued: true };
    }, transaction_options);
  }
  async activation_code(actor_id: string, id: string, reset = false) {
    return this.mail_transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const initial = await tx.partnerApplication.findUnique({
        where: { id },
        select: { user_id: true },
      });
      if (!initial)
        throw new AppError(
          404,
          'APPLICATION_NOT_FOUND',
          'Application not found.',
        );
      await require_active_account(tx, initial.user_id);
      await partner_lock(tx, initial.user_id);
      const app = await tx.partnerApplication.findUnique({ where: { id } });
      if (!app || app.status !== 'COMPLETED' || !app.activation_ciphertext)
        throw fail(
          'The applicant must sign in again after final approval before the code is generated.',
        );
      if (reset)
        await tx.partnerApplication.update({
          where: { id },
          data: { activation_attempts: 0 },
        });
      await this.audit(
        tx,
        actor_id,
        id,
        reset ? 'UNLOCK_PARTNER_ACTIVATION' : 'VIEW_PARTNER_ACTIVATION',
      );
      return {
        code: reveal_activation(app.activation_ciphertext),
        issued_at: app.activation_issued_at,
        attempts: reset ? 0 : app.activation_attempts,
      };
    }, transaction_options);
  }
  async activate(user_id: string, code: string) {
    const result = await this.database.client.$transaction(async (tx) => {
      await require_active_account(tx, user_id);
      await partner_lock(tx, user_id);
      const user = await require_active_account(tx, user_id);
      const app = await tx.partnerApplication.findUnique({
        where: { user_id },
      });
      if (app?.status === 'ACTIVATED') return { status: 'ACTIVATED' };
      if (
        !app ||
        app.status !== 'COMPLETED' ||
        !app.activation_hash ||
        !app.activation_salt
      )
        return {
          error:
            'Sign out and sign in again after final approval before entering your code.',
        };
      if (user.role === 'DRIVER')
        return { error: 'This account cannot be activated as a driver.' };
      if (app.activation_attempts >= 5)
        return {
          error:
            'Too many incorrect codes. Ask your administrator to unlock activation.',
        };
      if (!matches_activation(code, app.activation_salt, app.activation_hash)) {
        await tx.partnerApplication.update({
          where: { id: app.id },
          data: { activation_attempts: { increment: 1 } },
        });
        await this.audit(tx, user_id, app.id, 'PARTNER_ACTIVATION_FAILED', {
          attempt: app.activation_attempts + 1,
        });
        return {
          error:
            'Incorrect activation code. Please check the code sent by your administrator.',
        };
      }
      const promoted = await tx.user.updateMany({
        where: {
          id: user_id,
          role: user.role,
          status: 'ACTIVE',
          deleted_at: null,
        },
        data: {
          ...(user.role === 'RIDER' ? { role: 'DRIVER' as const } : {}),
          partner_activated_at: new Date(),
        },
      });
      if (promoted.count !== 1)
        return {
          error: 'This account changed. Sign in again before continuing.',
        };
      await tx.driverProfile.upsert({
        where: { user_id },
        create: {
          user_id,
          verification_status: 'VERIFIED',
          verified_at: new Date(),
        },
        update: { verification_status: 'VERIFIED', verified_at: new Date() },
      });
      await tx.partnerApplication.update({
        where: { id: app.id },
        data: {
          status: 'ACTIVATED',
          activated_at: new Date(),
          activation_hash: null,
          activation_salt: null,
          activation_ciphertext: null,
          version: { increment: 1 },
        },
      });
      await this.audit(tx, user_id, app.id, 'ACTIVATE_PARTNER_DRIVER');
      return { status: 'ACTIVATED' };
    }, transaction_options);
    if ('error' in result)
      throw new AppError(422, 'ACTIVATION_FAILED', result.error!);
    return result;
  }
  async mark_shared(actor_id: string, id: string) {
    return this.mail_transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const app = await tx.partnerApplication.findUnique({ where: { id } });
      if (!app || !['COMPLETED', 'ACTIVATED'].includes(app.status))
        throw conflict();
      await tx.partnerDelivery.update({
        where: {
          application_id_channel: { application_id: id, channel: 'WHATSAPP' },
        },
        data: {
          status: 'MANUALLY_SHARED',
          sent_at: new Date(),
          attempts: { increment: 1 },
        },
      });
      await this.audit(tx, actor_id, id, 'SHARE_PARTNER_PDF_MANUALLY');
      return { status: 'MANUALLY_SHARED' };
    }, transaction_options);
  }
}
