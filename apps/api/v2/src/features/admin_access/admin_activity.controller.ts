import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import {
  AuditRetentionService,
  AUDIT_RETENTION_DAYS,
  audit_cutoff,
} from '../../core/audit_retention.service.js';
import {
  admin_action_label,
  legacy_action_aliases,
  audit_resource,
} from '../../core/admin_audit.action.js';

const filter = z.object({
  query: z.string().trim().max(100).default(''),
  actor_id: z.string().max(100).optional(),
  outcome: z.enum(['all', 'success', 'failure', 'pending']).default('all'),
  activity: z.enum(['all', 'changes', 'reads']).default('all'),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
});
@Controller()
export class AdminActivityController {
  constructor(
    private readonly database: PrismaService,
    private readonly retention: AuditRetentionService,
  ) {}
  @Get('admin/activity')
  @UseGuards(AuthGuard, AdminGuard)
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = filter.parse(request.query);
    this.retention.schedule();
    const where: Prisma.AdminActivityWhereInput = {
      started_at: { gt: audit_cutoff() },
      ...(input.activity === 'changes'
        ? { method: { notIn: ['GET', 'HEAD', 'OPTIONS'] } }
        : input.activity === 'reads'
          ? { method: { in: ['GET', 'HEAD', 'OPTIONS'] } }
          : {}),
      ...(input.actor_id ? { actor_id: input.actor_id } : {}),
      ...(input.outcome === 'success'
        ? { status_code: { gte: 200, lt: 400 } }
        : input.outcome === 'failure'
          ? { status_code: { gte: 400 } }
          : input.outcome === 'pending'
            ? { completed_at: null }
            : {}),
      ...(input.query
        ? {
            OR: [
              { path: { contains: input.query, mode: 'insensitive' } },
              { request_id: { contains: input.query } },
              { actor_id: { contains: input.query } },
              {
                actor: {
                  email: { contains: input.query, mode: 'insensitive' },
                },
              },
              {
                actor: {
                  first_name: { contains: input.query, mode: 'insensitive' },
                },
              },
              {
                actor: {
                  last_name: { contains: input.query, mode: 'insensitive' },
                },
              },
              {
                action: {
                  ...(input.query.includes('_')
                    ? { equals: input.query.replaceAll('_', ' ').trim() }
                    : { contains: input.query }),
                  mode: 'insensitive',
                },
              },
              {
                action: {
                  in: legacy_action_aliases(input.query),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const result = await this.database.client.$transaction(
      async (tx) => {
        const total = await tx.adminActivity.count({ where });
        const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
        const activities = await tx.adminActivity.findMany({
          where,
          orderBy: [{ started_at: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * 20,
          take: 20,
          include: {
            actor: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                avatar_url: true,
              },
            },
          },
        });
        return {
          activities: activities.map((row) => ({
            ...row,
            resource: audit_resource(row.path),
            action:
              /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/|administrator request)/i.test(
                row.action,
              )
                ? admin_action_label(row.method, row.path)
                : row.action,
          })),
          total,
          page,
          page_size: 20,
          retention_days: AUDIT_RETENTION_DAYS,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return send_success(response, result, 'Administrator activity retrieved');
  }
}
