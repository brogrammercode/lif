import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  Observable,
  of,
  concatMap,
  catchError,
  from,
  mergeMap,
  throwError,
} from 'rxjs';
import type { Request, Response } from 'express';
import { PrismaService } from '../infra/database/prisma.service.js';
import { AppError } from './error.js';
import {
  IDEMPOTENCY_CONFLICT_MESSAGE,
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_IN_PROGRESS_MESSAGE,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_REQUIRED_MESSAGE,
  IDEMPOTENCY_TTL_HOURS,
  UNAUTHORIZED_ERROR_MESSAGE,
} from './constants.js';
import { HTTP_CONFIG } from './http.constant.js';
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly database: PrismaService) {}
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = request.header(IDEMPOTENCY_HEADER)?.trim();
    if (!key || key.length > IDEMPOTENCY_KEY_MAX_LENGTH)
      throw new AppError(
        400,
        'IDEMPOTENCY_REQUIRED',
        IDEMPOTENCY_REQUIRED_MESSAGE,
      );
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', UNAUTHORIZED_ERROR_MESSAGE);
    const matched_path: unknown = request.route?.path;
    const canonical_path =
      typeof matched_path === 'string'
        ? matched_path.replace(
            HTTP_CONFIG.ROUTE_PARAMETER_PATTERN,
            (_match, name: string) =>
              encodeURIComponent(String(request.params[name] ?? '')),
          )
        : (request.originalUrl.split('?')[0] ?? '');
    const route = canonical_path.replace(
      HTTP_CONFIG.IDEMPOTENCY_VERSION_PATH,
      HTTP_CONFIG.IDEMPOTENCY_COMPATIBILITY_PATH,
    );
    const scope = `${request.auth.user_id}:${request.method}:${route}`;
    const hash = createHash('sha256')
      .update(JSON.stringify(request.body ?? null))
      .digest('hex');
    const store = this.database.client.idempotencyKey;
    const now = new Date();
    let record = await store.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (record && record.expires_at <= now) {
      await store.deleteMany({
        where: { id: record.id, expires_at: { lte: now } },
      });
      record = null;
    }
    const replay = (existing: NonNullable<typeof record>) => {
      if (existing.request_hash !== hash)
        throw new AppError(
          422,
          'IDEMPOTENCY_CONFLICT',
          IDEMPOTENCY_CONFLICT_MESSAGE,
        );
      if (existing.response_json === null || existing.status_code === null)
        throw new AppError(
          409,
          'IDEMPOTENCY_IN_PROGRESS',
          IDEMPOTENCY_IN_PROGRESS_MESSAGE,
        );
      response.status(existing.status_code);
      return of(existing.response_json);
    };
    if (record) return replay(record);
    try {
      record = await store.create({
        data: {
          user_id: request.auth.user_id,
          scope,
          key,
          request_hash: hash,
          expires_at: new Date(
            now.getTime() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000,
          ),
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      record = await store.findUnique({ where: { scope_key: { scope, key } } });
      if (!record) throw error;
      return replay(record);
    }
    const record_id = record.id;
    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        try {
          await store.update({
            where: { id: record_id },
            data: {
              response_json: JSON.parse(
                JSON.stringify(body),
              ) as Prisma.InputJsonValue,
              status_code: response.statusCode,
            },
          });
        } catch (error) {
          console.error({ request_id: request.request_id, error });
        }
        return body;
      }),
      catchError((error: unknown) =>
        from(
          store
            .deleteMany({
              where: {
                id: record_id,
                response_json: { equals: Prisma.DbNull },
              },
            })
            .catch((cause) =>
              console.error({ request_id: request.request_id, error: cause }),
            ),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
}
