import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { VehicleCategoryModule } from '../vehicle_category/vehicle_category.module.js';
import { AppConfigurationController } from './app_configuration.controller.js';
import { AppConfigurationService } from './app_configuration.service.js';
import { ConfigurationRepository } from './configuration.repository.js';
@Module({
  imports: [DatabaseModule, VehicleCategoryModule],
  controllers: [AppConfigurationController],
  providers: [AppConfigurationService, ConfigurationRepository],
  exports: [AppConfigurationService],
})
export class AppConfigurationModule {}
