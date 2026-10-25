import { is_pending_poll } from '../features/admin_pending/pending.rules.js';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../infra/database/prisma.service.js';
import { randomUUID } from 'node:crypto';
import { admin_action_label } from './admin_audit.action.js';

export const is_admin_auth_path = (path: string) =>
  /^\/api\/v[12]\/admin\/auth\/(google|refresh|logout)\/?$/i.test(path);
export const is_admin_path = (path: string) =>
  /^\/api\/v[12]\/admin(?:\/|$)/i.test(path.split('?')[0]!);
export const should_audit_admin = (request: Request) =>
  Boolean(
    request.admin_actor_id ||
    request.admin_activity_id ||
    is_admin_path(request.originalUrl || request.path),
  );
type CompletionSource = 'handler' | 'response' | 'abort';

@Injectable()
export class AdminAuditService {
  private readonly starts = new WeakMap<Request, Promise<void>>();
  private readonly completions = new WeakMap<Request, Promise<void>>();
  private readonly completed = new WeakMap<
    Request,
    { source: CompletionSource; status_code: number }
  >();
  constructor(private readonly database: PrismaService) {}
  async start(request: Request) {
    if (request.admin_activity_id) return;
    const existing = this.starts.get(request);
    if (existing) return existing;
    const request_id = (request.request_id ??= randomUUID());
    const data = {
      request_id,
      actor_id: request.admin_actor_id,
      method: request.method,
      path: (request.originalUrl || request.path).split('?')[0]!.slice(0, 1000),
      action: admin_action_label(
        request.method,
        request.originalUrl || request.path,
      ),
      ip_address: request.ip?.slice(0, 100),
      user_agent: request.get('user-agent')?.slice(0, 1000),
    };
    const pending = this.database.client.adminActivity
      .upsert({
        where: { request_id },
        create: data,
        update: {},
        select: { id: true },
      })
      .then((record) => {
        request.admin_activity_id = record.id;
      });
    this.starts.set(request, pending);
    try {
      await pending;
    } finally {
      this.starts.delete(request);
    }
  }
  async complete(
    request: Request,
    response: Response,
    options: { status_code?: number; source?: CompletionSource } = {},
  ) {
    if (!should_audit_admin(request)) return;
    if (
      is_pending_poll(request.method, request.originalUrl || request.path) &&
      (options.status_code ?? response.statusCode) < 400
    )
      return;
    const source = options.source ?? 'handler';
    const status_code = options.status_code ?? response.statusCode;
    // Serialize competing finish/close callbacks. A completed handler can replace
    // an earlier client-disconnect entry; a late transport event cannot replace it.
    const pending = (this.completions.get(request) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const done = this.completed.get(request);
        if (done?.source === 'handler') {
          // Serialization can fail after a successful handler. Keep that final
          // error rather than the provisional success; transport events cannot
          // replace a handled outcome.
          if (
            source !== 'handler' ||
            status_code < 400 ||
            done.status_code >= 400
          )
            return;
        } else if (done && source !== 'handler') return;
        await this.start(request);
        await this.database.client.adminActivity.update({
          where: { id: request.admin_activity_id! },
          data: {
            actor_id: request.admin_actor_id,
            action: admin_action_label(
              request.method,
              request.originalUrl || request.path,
              request.body,
            ),
            status_code,
            completed_at: new Date(),
          },
        });
        this.completed.set(request, { source, status_code });
      });
    this.completions.set(request, pending);
    try {
      await pending;
    } finally {
      if (this.completions.get(request) === pending)
        this.completions.delete(request);
    }
  }
  report_failure(request: Request, error: unknown) {
    console.error({
      event: 'ADMIN_ACTIVITY_SAVE_FAILED',
      request_id: request.request_id,
      error,
    });
  }
}
