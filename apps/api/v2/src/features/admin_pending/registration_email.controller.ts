import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { AppError } from '../../core/error.js';
import { config } from '../../core/config.js';
import { send_success } from '../../core/response.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import {
  NEW_USER_EMAIL_TITLE,
  schedule_new_user_emails,
} from '../../infra/mail/new_user_email.js';

@Controller('admin/registration-emails')
@UseGuards(AuthGuard, AdminGuard)
export class RegistrationEmailController {
  constructor(private readonly database: PrismaService) {}
  @Get() async list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = z
      .object({
        page: z.coerce.number().int().min(1).max(1000000).default(1),
        status: z.enum(['pending', 'all']).default('pending'),
      })
      .strict()
      .parse(req.query);
    const where: Prisma.NotificationWhereInput = {
      channel: 'EMAIL',
      title: NEW_USER_EMAIL_TITLE,
      data: { path: ['kind'], equals: 'ADMIN_NEW_USER_EMAIL' },
      ...(input.status === 'pending'
        ? {
            sent_at: null,
            OR: [
              { data: { path: ['state'], equals: 'FAILED' } },
              { updated_at: { lt: new Date(Date.now() - 300000) } },
            ],
          }
        : {}),
    };
    const result = await this.database.client.$transaction(
      async (tx) => {
        const total = await tx.notification.count({ where });
        const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
        const rows = await tx.notification.findMany({
          where,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * 20,
          take: 20,
          select: {
            id: true,
            created_at: true,
            updated_at: true,
            sent_at: true,
            data: true,
          },
        });
        return {
          total,
          page,
          page_size: 20,
          items: rows.map((row) => {
            const data = row.data as Prisma.JsonObject;
            const details = (
              data.details &&
              typeof data.details === 'object' &&
              !Array.isArray(data.details)
                ? data.details
                : {}
            ) as Prisma.JsonObject;
            return {
              id: row.id,
              created_at: row.created_at,
              sent_at: row.sent_at,
              updated_at: row.updated_at,
              recipient: String(data.recipient_email),
              status: String(data.state),
              attempts: Number(data.attempts ?? 0),
              last_error: data.last_error ?? null,
              user: {
                id: String(details.id),
                name: String(details.name ?? ''),
                email: details.email ?? null,
              },
            };
          }),
          smtp_configured: !!config.MAIL_USER && !!config.GOOGLE_APP_PASSWORD,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    res.setHeader('Cache-Control', 'no-store');
    return send_success(res, result, 'Registration email deliveries loaded');
  }
  @Post(':id/retry') async retry(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = z.string().min(1).max(100).parse(req.params.id);
    await this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, req.auth!.user_id);
      const row = await tx.notification.findFirst({
        where: {
          id,
          channel: 'EMAIL',
          title: NEW_USER_EMAIL_TITLE,
          sent_at: null,
        },
      });
      const data = row?.data as Prisma.JsonObject | undefined;
      if (
        !row ||
        !data ||
        data.kind !== 'ADMIN_NEW_USER_EMAIL' ||
        (data.state === 'SENDING' &&
          row.updated_at.getTime() > Date.now() - 300000)
      )
        throw new AppError(
          409,
          'EMAIL_NOT_RETRYABLE',
          'This email was sent or is still being delivered. Refresh its status.',
        );
      const updated = await tx.notification.updateMany({
        where: {
          id,
          updated_at: row.updated_at,
          sent_at: null,
          data: { equals: row.data as Prisma.InputJsonValue },
        },
        data: {
          data: {
            ...data,
            state: 'PENDING',
            last_error: null,
          } as Prisma.InputJsonObject,
        },
      });
      if (!updated.count)
        throw new AppError(
          409,
          'EMAIL_CHANGED',
          'This delivery changed. Refresh and try again.',
        );
      await create_user_log(tx, {
        actor_id: req.auth!.user_id,
        entity_type: 'Notification',
        entity_id: id,
        action: 'RETRY_REGISTRATION_EMAIL',
        after_data: { queued: true },
      });
    });
    schedule_new_user_emails();
    return send_success(
      res,
      { queued: 1 },
      'Registration email queued for retry',
    );
  }
}
