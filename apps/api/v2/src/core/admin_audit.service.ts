import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../infra/database/prisma.service.js';

export const is_admin_auth_path = (path: string) =>
  /^\/api\/v[12]\/admin\/auth\/(google|refresh|logout)\/?$/i.test(path);

@Injectable()
export class AdminAuditService {
  constructor(private readonly database: PrismaService) {}
  async start(request: Request) {
    if (request.admin_activity_id) return;
    const record = await this.database.client.adminActivity.create({
      data: {
        request_id: request.request_id!,
        actor_id: request.admin_actor_id,
        method: request.method,
        path: request.path.slice(0, 1000),
        action:
          `${request.method} ${request.route?.path ?? request.path}`.slice(
            0,
            1100,
          ),
        ip_address: request.ip?.slice(0, 100),
        user_agent: request.get('user-agent')?.slice(0, 1000),
      },
    });
    request.admin_activity_id = record.id;
  }
  async complete(request: Request, response: Response) {
    if (!request.admin_activity_id) await this.start(request);
    await this.database.client.adminActivity.update({
      where: { id: request.admin_activity_id! },
      data: {
        actor_id: request.admin_actor_id,
        status_code: response.statusCode,
        completed_at: new Date(),
      },
    });
  }
}
