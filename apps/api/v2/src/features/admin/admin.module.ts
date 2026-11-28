import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminRepository } from './admin.repository.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AdminService } from './admin.service.js';
@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [AdminRepository, AdminService],
  exports: [AdminRepository, AdminService],
})
export class AdminModule {}
