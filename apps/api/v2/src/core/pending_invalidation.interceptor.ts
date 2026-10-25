import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { concatMap, catchError } from 'rxjs';
import type { Request } from 'express';
import { PrismaService } from '../infra/database/prisma.service.js';
import { changes_pending } from '../features/admin_pending/pending.rules.js';

@Injectable()
export class PendingInvalidationInterceptor implements NestInterceptor {
  constructor(private readonly database: PrismaService) {}
  async invalidate(request: Request) {
    try {
      await this.database.client.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(720091)`;
          await tx.$executeRaw`DELETE FROM admin_pending_snapshots`;
        },
        { maxWait: 1000, timeout: 3000 },
      );
    } catch {
      console.warn({
        event: 'PENDING_COUNTS_INVALIDATION_FAILED',
        request_id: request.request_id,
      });
    }
  }
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      !request.auth ||
      !changes_pending(request.method, request.originalUrl || request.path)
    )
      return next.handle();
    // Runs after committed writes from either app. Handler failures can occur
    // after a commit too; invalidate then preserve the original error.
    return next.handle().pipe(
      concatMap(async (value) => {
        await this.invalidate(request);
        return value;
      }),
      catchError(async (error) => {
        await this.invalidate(request);
        throw error;
      }),
    );
  }
}
