import { DriverOperationsModule } from '../driver_operations/driver_operations.module.js';
import { Module } from '@nestjs/common';
import { AppConfigurationModule } from '../app_configuration/app_configuration.module.js';
import { RideController } from './ride.controller.js';
import { RideRepository } from './ride.repo.js';
import { RideService } from './ride.service.js';
import { VehicleCategoryModule } from '../vehicle_category/vehicle_category.module.js';
import { GeocodeModule } from '../geocode/geocode.module.js';
@Module({
  imports: [
    DriverOperationsModule,
    AppConfigurationModule,
    VehicleCategoryModule,
    GeocodeModule,
  ],
  controllers: [RideController],
  providers: [RideRepository, RideService],
  exports: [RideRepository, RideService],
})
export class RideModule {}
