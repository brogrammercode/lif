import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  require_active_account,
  require_active_admin,
} from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import { partner_lock } from './partner_program.security.js';
import type { AssetInput } from './partner_program.type.js';
import type {
  exit_create_input,
  exit_review_input,
  exit_list_input,
} from './partner_exit.type.js';

const options = { maxWait: 10000, timeout: 30000 };
const application = {
  select: {
    id: true,
    user_id: true,
    contact_email: true,
    whatsapp_phone: true,
    user: { select: { first_name: true, last_name: true } },
    deliveries: {
      where: { channel: 'EXIT_EMAIL' },
      select: {
        status: true,
        attempts: true,
        sent_at: true,
        claimed_at: true,
        last_error: true,
      },
    },
  },
} as const;
const changed = () =>
  new AppError(
    409,
    'EXIT_REQUEST_CHANGED',
    'This exit request changed. Refresh it before continuing.',
  );
@Injectable()
export class PartnerExitService {
  constructor(private readonly database: PrismaService) {}
  async mine(user_id: string) {
    return this.database.client.partnerExitRequest.findFirst({
      where: { application: { user_id } },
      include: { application },
    });
  }
  async create(
    actor_id: string,
    input: z.infer<typeof exit_create_input>,
    application_id?: string,
  ) {
    return this.database.client.$transaction(async (tx) => {
      if (application_id) await require_active_admin(tx, actor_id);
      else await require_active_account(tx, actor_id);
      const app = await tx.partnerApplication.findUnique({
        where: application_id ? { id: application_id } : { user_id: actor_id },
      });
      if (!app)
        throw new AppError(
          404,
          'APPLICATION_NOT_FOUND',
          'Partner application not found.',
        );
      await require_active_account(tx, app.user_id);
      await partner_lock(tx, app.user_id);
      // Re-read after the lock; exits must only start for active partners.
      const current = await tx.partnerApplication.findUnique({
        where: { id: app.id },
        select: { status: true },
      });
      if (current?.status !== 'ACTIVATED')
        throw new AppError(
          409,
          'PARTNER_NOT_ACTIVE',
          'Only an activated driver can request an exit.',
        );
      const before = await tx.partnerExitRequest.findUnique({
        where: { application_id: app.id },
      });
      if (
        before &&
        (before.status !== 'REJECTED' || before.version !== input.version)
      )
        throw changed();
      if (!before && input.version !== 0) throw changed();
      const row = before
        ? await tx.partnerExitRequest.update({
            where: { id: before.id },
            data: {
              reason: input.reason,
              status: 'REQUESTED',
              rejection_reason: null,
              version: { increment: 1 },
            },
          })
        : await tx.partnerExitRequest.create({
            data: { application_id: app.id, reason: input.reason },
          });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'PartnerExitRequest',
        entity_id: row.id,
        action: before ? 'RESUBMIT_PARTNER_EXIT' : 'REQUEST_PARTNER_EXIT',
        before_data: before,
        after_data: row,
      });
      return row;
    }, options);
  }
  async list(input: z.infer<typeof exit_list_input>) {
    const where: Prisma.PartnerExitRequestWhereInput = {
      ...(input.status === 'all' ? {} : { status: input.status }),
      ...(input.query
        ? {
            OR: [
              { id: { contains: input.query } },
              { application: { user_id: { contains: input.query } } },
              {
                application: {
                  contact_email: { contains: input.query, mode: 'insensitive' },
                },
              },
              {
                application: {
                  user: {
                    first_name: { contains: input.query, mode: 'insensitive' },
                  },
                },
              },
              {
                application: {
                  user: {
                    last_name: { contains: input.query, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const total = await this.database.client.partnerExitRequest.count({
      where,
    });
    const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
    const rows = await this.database.client.partnerExitRequest.findMany({
      where,
      include: { application },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 20,
      skip: (page - 1) * 20,
    });
    return { rows, total, page, page_size: 20 };
  }
  async detail(id: string) {
    const row = await this.database.client.partnerExitRequest.findUnique({
      where: { id },
      include: { application },
    });
    if (!row)
      throw new AppError(404, 'EXIT_NOT_FOUND', 'Exit request not found.');
    return row;
  }
  async upload(actor_id: string, id: string, input: AssetInput) {
    const match = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      input.data_url,
    );
    const bytes = match ? Buffer.from(match[1]!, 'base64') : Buffer.alloc(0);
    if (
      !match ||
      !bytes.length ||
      bytes.length > 3_000_000 ||
      bytes.toString('base64') !== match[1] ||
      !/\.pdf$/i.test(input.file_name) ||
      bytes.subarray(0, 5).toString() !== '%PDF-'
    )
      throw new AppError(422, 'INVALID_PDF', 'Choose a valid PDF up to 3 MB.');
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const exit = await tx.partnerExitRequest.findUnique({
        where: { id },
        include: { application },
      });
      if (!exit)
        throw new AppError(404, 'EXIT_NOT_FOUND', 'Exit request not found.');
      await require_active_account(tx, exit.application.user_id);
      await partner_lock(tx, exit.application.user_id);
      const current = await tx.partnerExitRequest.findUnique({ where: { id } });
      if (!current || !['REQUESTED', 'REVIEWING'].includes(current.status))
        throw changed();
      const digest = createHash('sha256').update(bytes).digest('hex');
      const duplicate = await tx.partnerAsset.findFirst({
        where: {
          owner_id: exit.application.user_id,
          purpose: 'EXIT_PDF',
          field_id: id,
          sha256: digest,
          file_name: input.file_name,
        },
        select: { id: true },
      });
      if (duplicate) return duplicate;
      const quota = await tx.partnerAsset.aggregate({
        where: { owner_id: exit.application.user_id },
        _sum: { size: true },
        _count: true,
      });
      if (
        (quota._sum.size ?? 0) + bytes.length > 100_000_000 ||
        quota._count >= 2000
      )
        throw new AppError(
          422,
          'UPLOAD_LIMIT',
          'This account has reached its upload allowance.',
        );
      const asset = await tx.partnerAsset.create({
        data: {
          owner_id: exit.application.user_id,
          purpose: 'EXIT_PDF',
          field_id: id,
          file_name: input.file_name,
          mime_type: 'application/pdf',
          size: bytes.length,
          content: Uint8Array.from(bytes),
          sha256: digest,
        },
        select: { id: true },
      });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'PartnerExitRequest',
        entity_id: id,
        action: 'UPLOAD_EXIT_PDF',
        after_data: { asset_id: asset.id },
      });
      return asset;
    }, options);
  }
  async review(
    actor_id: string,
    id: string,
    input: z.infer<typeof exit_review_input>,
  ) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const initial = await tx.partnerExitRequest.findUnique({
        where: { id },
        include: { application },
      });
      if (!initial)
        throw new AppError(404, 'EXIT_NOT_FOUND', 'Exit request not found.');
      const user_id = initial.application.user_id;
      await require_active_account(tx, user_id);
      await partner_lock(tx, user_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
      const before = await tx.partnerExitRequest.findUnique({ where: { id } });
      if (
        !before ||
        before.version !== input.version ||
        !['REQUESTED', 'REVIEWING'].includes(before.status)
      )
        throw changed();
      if (input.status === 'COMPLETED') {
        const app = await tx.partnerApplication.findUnique({
          where: { id: initial.application_id },
          select: { status: true },
        });
        if (app?.status !== 'ACTIVATED') throw changed();
        const pdf = await tx.partnerAsset.findFirst({
          where: {
            id: input.settlement_pdf_id!,
            owner_id: user_id,
            purpose: 'EXIT_PDF',
            field_id: id,
            mime_type: 'application/pdf',
          },
          select: { id: true },
        });
        if (!pdf)
          throw new AppError(
            422,
            'EXIT_PDF_REQUIRED',
            'Upload the settlement PDF for this exit request.',
          );
        const profile = await tx.driverProfile.findUnique({
          where: { user_id },
          select: { id: true },
        });
        if (
          profile &&
          (await tx.ride.count({
            where: {
              driver_id: profile.id,
              status: {
                in: [
                  'DRIVER_ASSIGNED',
                  'DRIVER_ARRIVING',
                  'DRIVER_WAITING',
                  'IN_PROGRESS',
                ],
              },
            },
          }))
        )
          throw new AppError(
            409,
            'DRIVER_ON_TRIP',
            'Complete or reassign the current ride before finalizing the exit.',
          );
        await tx.driverProfile.updateMany({
          where: { user_id },
          data: { availability: 'SUSPENDED', verification_status: 'EXPIRED' },
        });
        if (profile)
          await tx.rideOffer.updateMany({
            where: { driver_id: profile.id, status: 'SENT' },
            data: { status: 'CANCELLED', responded_at: new Date() },
          });
        await tx.partnerApplication.update({
          where: { id: initial.application_id },
          data: {
            status: 'EXITED',
            version: { increment: 1 },
            activation_hash: null,
            activation_salt: null,
            activation_ciphertext: null,
          },
        });
        await tx.partnerDelivery.upsert({
          where: {
            application_id_channel: {
              application_id: initial.application_id,
              channel: 'EXIT_EMAIL',
            },
          },
          create: {
            application_id: initial.application_id,
            channel: 'EXIT_EMAIL',
          },
          update: { status: 'PENDING', last_error: null, claimed_at: null },
        });
      }
      const row = await tx.partnerExitRequest.update({
        where: { id },
        data: {
          status: input.status,
          admin_notes: input.admin_notes || null,
          rejection_reason:
            input.status === 'REJECTED' ? input.rejection_reason : null,
          dues_amount: input.dues_amount,
          dues_direction: input.dues_direction,
          reviewed_by_id: actor_id,
          version: { increment: 1 },
          ...(input.status === 'COMPLETED'
            ? {
                settlement_pdf_id: input.settlement_pdf_id!,
                completed_at: new Date(),
              }
            : {}),
        },
      });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'PartnerExitRequest',
        entity_id: id,
        action:
          input.status === 'COMPLETED'
            ? 'COMPLETE_PARTNER_EXIT'
            : 'REVIEW_PARTNER_EXIT',
        before_data: before,
        after_data: row,
      });
      await tx.notification.create({
        data: {
          user_id,
          type: 'ACCOUNT',
          title:
            input.status === 'COMPLETED'
              ? 'Partner exit completed'
              : 'Partner exit request updated',
          body:
            input.status === 'COMPLETED'
              ? 'Your settlement PDF is ready. Driver operations are disabled.'
              : input.status === 'REJECTED'
                ? input.rejection_reason
                : 'Your exit request is being reviewed.',
          data: { route: '/driver/exit' },
        },
      });
      return row;
    }, options);
  }
  async shared(actor_id: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const row = await tx.partnerExitRequest.findUnique({
        where: { id },
        include: { application },
      });
      if (!row || row.status !== 'COMPLETED' || !row.settlement_pdf_id)
        throw new AppError(
          409,
          'EXIT_PDF_NOT_READY',
          'Complete the exit before recording manual sharing.',
        );
      await require_active_account(tx, row.application.user_id);
      await partner_lock(tx, row.application.user_id);
      const updated = await tx.partnerExitRequest.update({
        where: { id },
        data: { manually_shared_at: new Date() },
      });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'PartnerExitRequest',
        entity_id: id,
        action: 'MANUALLY_SHARE_EXIT_PDF',
      });
      return updated;
    }, options);
  }
  async retry_email(actor_id: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const row = await tx.partnerExitRequest.findUnique({
        where: { id },
        include: { application },
      });
      if (!row || row.status !== 'COMPLETED' || !row.settlement_pdf_id)
        throw new AppError(
          409,
          'EXIT_PDF_NOT_READY',
          'Complete the exit before sending its settlement PDF.',
        );
      await require_active_account(tx, row.application.user_id);
      await partner_lock(tx, row.application.user_id);
      await create_user_log(tx, {
        actor_id,
        entity_type: 'PartnerExitRequest',
        entity_id: id,
        action: 'RETRY_PARTNER_EXIT_EMAIL',
      });
      return row.application_id;
    }, options);
  }
}
