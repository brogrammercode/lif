import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { TransactionClient } from '../../infra/database/client.js';
import {
  ACCOUNT_LIFECYCLE_LOCK,
  require_active_admin,
} from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import { partner_lock } from './partner_program.security.js';

export const application_delete_input = z
  .object({
    version: z.number().int().positive(),
    confirmation: z.string().trim().min(1).max(320),
  })
  .strict();
const purposes = ['APPLICATION_DOCUMENT', 'APPLICATION_SELFIE', 'FINAL_PDF'];
const selection = {
  id: true,
  user_id: true,
  version: true,
  status: true,
  created_at: true,
  contact_email: true,
  activated_at: true,
  user: {
    select: {
      first_name: true,
      last_name: true,
      role: true,
      partner_activated_at: true,
    },
  },
  confirmation: { select: { id: true } },
  exit_request: { select: { id: true } },
  _count: { select: { fields: true, deliveries: true } },
} satisfies Prisma.PartnerApplicationSelect;
const notification_filter = (app: {
  id: string;
  user_id: string;
  created_at: Date;
}): Prisma.NotificationWhereInput => ({
  OR: [
    { data: { path: ['application_id'], equals: app.id } },
    // Older in-app status notices did not carry application_id. There is one
    // application per owner, so only this application's time window is included.
    {
      user_id: app.user_id,
      type: 'ACCOUNT',
      channel: 'IN_APP',
      created_at: { gte: app.created_at },
      data: { path: ['route'], equals: '/partner-program' },
    },
  ],
});
const missing = () =>
  new AppError(
    404,
    'APPLICATION_NOT_FOUND',
    'Application not found. Refresh the list.',
  );

@Injectable()
export class PartnerApplicationDeletionService {
  constructor(private readonly database: PrismaService) {}
  private async snapshot(tx: TransactionClient, id: string) {
    const app = await tx.partnerApplication.findUnique({
      where: { id },
      select: selection,
    });
    if (!app) throw missing();
    const notifications = notification_filter(app);
    const [uploads, notification_count, sending_mail, sending_pdf] =
      await Promise.all([
        tx.partnerAsset.aggregate({
          where: { owner_id: app.user_id, purpose: { in: purposes } },
          _count: { _all: true },
          _sum: { size: true },
        }),
        tx.notification.count({ where: notifications }),
        tx.notification.count({
          where: {
            AND: [
              notifications,
              {
                channel: 'EMAIL',
                sent_at: null,
                data: { path: ['state'], equals: 'SENDING' },
              },
            ],
          },
        }),
        tx.partnerDelivery.count({
          where: { application_id: id, status: 'SENDING' },
        }),
      ]);
    const activated =
      !!app.activated_at ||
      !!app.user.partner_activated_at ||
      app.user.role === 'DRIVER' ||
      ['ACTIVATED', 'EXITED'].includes(app.status) ||
      !!app.exit_request;
    return {
      app,
      notifications,
      preview: {
        id: app.id,
        version: app.version,
        status: app.status,
        contact_email: app.contact_email,
        name:
          [app.user.first_name, app.user.last_name].filter(Boolean).join(' ') ||
          app.contact_email,
        allowed: !activated && !sending_mail && !sending_pdf,
        blocked_reason: activated
          ? 'Applications can be deleted only before driver activation. Activated or exited driver history must be retained.'
          : sending_mail || sending_pdf
            ? 'An email delivery is in progress. Wait for it to finish, then refresh this preview.'
            : null,
        counts: {
          fields: app._count.fields,
          confirmations: app.confirmation ? 1 : 0,
          deliveries: app._count.deliveries,
          uploads: uploads._count._all,
          upload_bytes: uploads._sum.size ?? 0,
          notifications: notification_count,
        },
      },
    };
  }
  async preview(actor_id: string, id: string) {
    return this.database.client.$transaction(
      async (tx) => {
        await require_active_admin(tx, actor_id);
        return (await this.snapshot(tx, id)).preview;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 10000,
        timeout: 30000,
      },
    );
  }
  async remove(
    actor_id: string,
    id: string,
    input: z.infer<typeof application_delete_input>,
  ) {
    return this.database.client.$transaction(
      async (tx) => {
        await require_active_admin(tx, actor_id);
        const initial = await tx.partnerApplication.findUnique({
          where: { id },
          select: { user_id: true, created_at: true },
        });
        if (!initial) throw missing();
        // Match the lifecycle -> partner lock order used by onboarding writes.
        // The partner lock serializes activation; shared lifecycle access also
        // prevents an account deactivation from racing the deletion.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${ACCOUNT_LIFECYCLE_LOCK}::integer, hashtext(${initial.user_id}))`;
        await partner_lock(tx, initial.user_id);
        // Serialize deletion against delivery claims. A worker claiming after the
        // delete sees zero rows; an already running delivery blocks deletion.
        await tx.$queryRaw`SELECT id FROM partner_deliveries WHERE application_id=${id} ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM notifications WHERE data->>'application_id'=${id} OR (user_id=${initial.user_id} AND type='ACCOUNT' AND channel='IN_APP' AND created_at>=${initial.created_at} AND data->>'route'='/partner-program') ORDER BY id FOR UPDATE`;
        const { app, preview, notifications } = await this.snapshot(tx, id);
        if (app.version !== input.version)
          throw new AppError(
            409,
            'APPLICATION_CHANGED',
            'This application changed. Reload the deletion preview before continuing.',
          );
        if (!preview.allowed)
          throw new AppError(
            409,
            'APPLICATION_DELETE_BLOCKED',
            preview.blocked_reason!,
          );
        if (
          input.confirmation.toLowerCase() !==
          app.contact_email.trim().toLowerCase()
        )
          throw new AppError(
            422,
            'CONFIRMATION_REQUIRED',
            'Enter the applicant email exactly as displayed to confirm deletion.',
          );
        await tx.notification.deleteMany({ where: notifications });
        // Fields, confirmation and delivery records use FK ON DELETE CASCADE.
        await tx.partnerApplication.delete({ where: { id } });
        await tx.partnerAsset.deleteMany({
          where: { owner_id: app.user_id, purpose: { in: purposes } },
        });
        await create_user_log(tx, {
          actor_id,
          entity_type: 'PartnerApplication',
          entity_id: id,
          action: 'DELETE_PARTNER_APPLICATION',
          before_data: {
            user_id: app.user_id,
            status: app.status,
            version: app.version,
          },
          after_data: { deleted: preview.counts },
        });
        return { id, deleted: preview.counts };
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }
}
