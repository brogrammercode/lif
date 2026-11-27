import { Controller, Get, Header, Headers } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { CronJobs } from './cron.jobs.js';

@Controller('internal/cron')
export class CronController {
  constructor(private readonly jobs: CronJobs) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async run(@Headers('authorization') authorization?: string) {
    const secret = config.CRON_SECRET;
    const supplied = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    if (
      !secret ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'A valid scheduler credential is required.',
      );

    return {
      status: 'success',
      data: await this.jobs.run(),
      message: 'Scheduled jobs completed',
    };
  }
}
