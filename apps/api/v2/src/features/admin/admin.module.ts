import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminRepository } from './admin.repo.js';
import { AdminService } from './admin.service.js';
@Module({
  imports: [],
  controllers: [AdminController],
  providers: [AdminRepository, AdminService],
  exports: [AdminRepository, AdminService],
})
export class AdminModule {}
