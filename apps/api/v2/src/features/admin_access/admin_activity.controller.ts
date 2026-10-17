import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';

const filter = z.object({
  query: z.string().trim().max(100).default(''),
  actor_id: z.string().max(100).optional(),
  outcome: z.enum(['all', 'success', 'failure', 'pending']).default('all'),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
});
@Controller()
export class AdminActivityController {
  constructor(private readonly database: PrismaService) {}
  @Get('admin/activity')
  @UseGuards(AuthGuard, AdminGuard)
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = filter.parse(request.query);
    const where: Prisma.AdminActivityWhereInput = {
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
              { action: { contains: input.query, mode: 'insensitive' } },
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
        return { activities, total, page, page_size: 20 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return send_success(response, result, 'Administrator activity retrieved');
  }
}
