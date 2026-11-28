import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { DriverAccountService } from './driver_account.service.js';
import { DriverAccountController } from './driver_account.controller.js';
@Module({
  imports: [DatabaseModule],
  controllers: [DriverAccountController],
  providers: [DriverAccountService],
})
export class DriverAccountModule {}
