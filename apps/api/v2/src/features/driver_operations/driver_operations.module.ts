import { Module } from '@nestjs/common';
import { GeocodeModule } from '../geocode/geocode.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { DriverOperationsController } from './driver_operations.controller.js';
import { DriverOperationsService } from './driver_operations.service.js';
@Module({
  imports: [DatabaseModule, GeocodeModule],
  controllers: [DriverOperationsController],
  providers: [DriverOperationsService],
  exports: [DriverOperationsService],
})
export class DriverOperationsModule {}
