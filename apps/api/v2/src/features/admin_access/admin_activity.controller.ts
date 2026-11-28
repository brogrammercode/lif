import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import {
  AdminActivityReader,
  activityFilter,
  type ActivityFilter,
} from './admin-activity.reader.js';

@Controller('admin/activity')
@UseGuards(AuthGuard, AdminGuard)
export class AdminActivityController {
  constructor(private readonly activity: AdminActivityReader) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(activityFilter)) input: ActivityFilter,
  ) {
    return success(
      await this.activity.list(input),
      'Administrator activity retrieved',
    );
  }
}
