import { DriverOperationsModule } from '../driver_operations/driver_operations.module.js';
import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller.js';
import { DriverRepository } from './driver.repo.js';
import { DriverService } from './driver.service.js';
@Module({
  imports: [DriverOperationsModule],
  controllers: [DriverController],
  providers: [DriverRepository, DriverService],
  exports: [DriverRepository, DriverService],
})
export class DriverModule {}
