import type { Request, Response } from 'express';
import { send_success } from '../../core/response.js';
import { prisma } from '../../infra/database/client.js';
import { HEALTH_DATABASE_ERROR, HEALTH_OK_MESSAGE } from './health.constant.js';

export const get_health = async (_request: Request, response: Response): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    send_success(response, { database: 'connected' }, HEALTH_OK_MESSAGE);
  } catch {
    response.status(503).json({ status: 'error', message: HEALTH_DATABASE_ERROR, data: { database: 'disconnected' } });
  }
};
