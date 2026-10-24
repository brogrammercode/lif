import { Module } from '@nestjs/common';
import { AppConfigurationController } from './app_configuration.controller.js';
import { AppConfigurationService } from './app_configuration.service.js';
@Module({
  controllers: [AppConfigurationController],
  providers: [AppConfigurationService],
  exports: [AppConfigurationService],
})
export class AppConfigurationModule {}
