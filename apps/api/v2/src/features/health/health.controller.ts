import { Controller, HttpCode, Res, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';
import { HEALTH_ROUTES } from './health.route.js';
import type { Response } from 'express';
import { send_success } from '../../core/response.js';
import { HEALTH_DATABASE_ERROR, HEALTH_OK_MESSAGE } from './health.constant.js';
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  @Get(HEALTH_ROUTES.GET_HEALTH)
  @HttpCode(200)
  async get_health(@Res({ passthrough: true }) response: Response) {
    if (await this.healthService.database_status()) {
      return send_success(
        response,
        { database: 'connected' },
        HEALTH_OK_MESSAGE,
      );
    }
    response.status(503);
    return {
      status: 'error',
      message: HEALTH_DATABASE_ERROR,
      data: { database: 'disconnected' },
    };
  }
}
