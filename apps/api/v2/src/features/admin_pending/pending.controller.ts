import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { PendingService } from './pending.service.js';
import { pending_query } from './pending.rules.js';
@Controller('admin/pending-counts')
@UseGuards(AuthGuard, AdminGuard)
export class PendingController {
  constructor(private readonly service: PendingService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Pending-Counts-Version', '1')
  @Header('X-Pending-Counts-TTL', '30')
  async counts(
    @Query(new ZodValidationPipe(pending_query))
    input: z.infer<typeof pending_query>,
  ) {
    return success(
      await this.service.counts(input),
      'Pending counts retrieved',
    );
  }
}
