import { Module } from '@nestjs/common';
import { DriverAccountService } from './driver_account.service.js';
import { DriverAccountController } from './driver_account.controller.js';
@Module({
  controllers: [DriverAccountController],
  providers: [DriverAccountService],
})
export class DriverAccountModule {}
