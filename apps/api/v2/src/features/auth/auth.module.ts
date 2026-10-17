import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repo.js';
import { AuthService } from './auth.service.js';
@Module({
  imports: [],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService],
  exports: [AuthRepository, AuthService],
})
export class AuthModule {}
