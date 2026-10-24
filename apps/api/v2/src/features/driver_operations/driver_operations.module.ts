import { Module } from '@nestjs/common';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { DriverOperationsController } from './driver_operations.controller.js';
import { DriverOperationsService } from './driver_operations.service.js';
@Module({
  imports: [GeocodeModule],
  controllers: [DriverOperationsController],
  providers: [DriverOperationsService],
  exports: [DriverOperationsService],
})
export class DriverOperationsModule {}
