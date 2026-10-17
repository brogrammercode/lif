import { Module } from '@nestjs/common';
import { AdminUserController } from './admin_user.controller.js';
import { AdminUserRepository } from './admin_user.repo.js';
import { AdminUserService } from './admin_user.service.js';
@Module({
  imports: [],
  controllers: [AdminUserController],
  providers: [AdminUserRepository, AdminUserService],
  exports: [AdminUserRepository, AdminUserService],
})
export class AdminUserModule {}
