import { Module } from '@nestjs/common';
import { AdminAccessController } from './admin_access.controller.js';
import { AdminActivityController } from './admin_activity.controller.js';
import { AdminAccessRepository } from './admin_access.repo.js';
import { AdminAccessService } from './admin_access.service.js';
@Module({
  controllers: [AdminAccessController, AdminActivityController],
  providers: [AdminAccessRepository, AdminAccessService],
})
export class AdminAccessModule {}
