import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin_auth.controller.js';
import { AdminAuthRepository } from './admin_auth.repo.js';
import { AdminAuthService } from './admin_auth.service.js';
@Module({
  imports: [],
  controllers: [AdminAuthController],
  providers: [AdminAuthRepository, AdminAuthService],
  exports: [AdminAuthRepository, AdminAuthService],
})
export class AdminAuthModule {}
