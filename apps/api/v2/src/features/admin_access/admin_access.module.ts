import { Module } from '@nestjs/common';
import { AdminAccessController } from './admin_access.controller.js';
import { AdminActivityController } from './admin_activity.controller.js';
import { AdminAccessRepository } from './admin_access.repo.js';
import { AdminAccessService } from './admin_access.service.js';
import { AdminAccessReader } from './admin-access.reader.js';
import { AdminActivityReader } from './admin-activity.reader.js';
import { DatabaseModule } from '../../database/database.module.js';
@Module({
  imports: [DatabaseModule],
  controllers: [AdminAccessController, AdminActivityController],
  providers: [
    AdminAccessRepository,
    AdminAccessService,
    AdminAccessReader,
    AdminActivityReader,
  ],
})
export class AdminAccessModule {}
