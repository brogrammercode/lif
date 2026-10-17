import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../core/error.js';
import {
  IDEMPOTENCY_CONFLICT_MESSAGE,
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_IN_PROGRESS_MESSAGE,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_REQUIRED_MESSAGE,
  IDEMPOTENCY_TTL_HOURS,
} from '../core/constants.js';
import { prisma } from '../infra/database/client.js';

const request_hash = (request_body: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(request_body ?? null))
    .digest('hex');

export const require_idempotency: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const key = request.header(IDEMPOTENCY_HEADER)?.trim();
    if (!key || key.length > IDEMPOTENCY_KEY_MAX_LENGTH)
      throw new AppError(
        400,
        'IDEMPOTENCY_REQUIRED',
        IDEMPOTENCY_REQUIRED_MESSAGE,
      );
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');

    const scope = `${request.auth.user_id}:${request.method}:${request.originalUrl.split('?')[0]}`;
    const hash = request_hash(request.body);
    const now = new Date();
    let record = await prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope, key } },
    });

    if (record && record.expires_at <= now) {
      await prisma.idempotencyKey.deleteMany({
        where: { id: record.id, expires_at: { lte: now } },
      });
      record = null;
    }

    if (record) {
      if (record.request_hash !== hash)
        throw new AppError(
          422,
          'IDEMPOTENCY_CONFLICT',
          IDEMPOTENCY_CONFLICT_MESSAGE,
        );
      if (record.response_json === null || record.status_code === null)
        throw new AppError(
          409,
          'IDEMPOTENCY_IN_PROGRESS',
          IDEMPOTENCY_IN_PROGRESS_MESSAGE,
        );
      response.status(record.status_code).json(record.response_json);
      return;
    }

    try {
      record = await prisma.idempotencyKey.create({
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
      record = await prisma.idempotencyKey.findUnique({
        where: { scope_key: { scope, key } },
      });
      if (!record) throw error;
      if (record.request_hash !== hash)
        throw new AppError(
          422,
          'IDEMPOTENCY_CONFLICT',
          IDEMPOTENCY_CONFLICT_MESSAGE,
        );
      if (record.response_json === null || record.status_code === null)
        throw new AppError(
          409,
          'IDEMPOTENCY_IN_PROGRESS',
          IDEMPOTENCY_IN_PROGRESS_MESSAGE,
        );
      response.status(record.status_code).json(record.response_json);
      return;
    }

    const record_id = record.id;
    const original_json = response.json.bind(response);
    response.json = ((body: unknown) => {
      void prisma.idempotencyKey
        .update({
          where: { id: record_id },
          data: {
            response_json: body as Prisma.InputJsonValue,
            status_code: response.statusCode,
          },
        })
        .catch((error: unknown) =>
          console.error({ request_id: request.request_id, error }),
        );
      return original_json(body);
    }) as typeof response.json;
    next();
  } catch (error) {
    next(error);
  }
};
