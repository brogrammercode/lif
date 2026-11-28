import { Module } from '@nestjs/common';
import { EmergencyController } from './emergency.controller.js';
import { EmergencyRepository } from './emergency.repository.js';
import { EmergencyService } from './emergency.service.js';
import { DatabaseModule } from '../../database/database.module.js';
@Module({
  imports: [DatabaseModule],
  controllers: [EmergencyController],
  providers: [EmergencyRepository, EmergencyService],
  exports: [EmergencyRepository, EmergencyService],
})
export class EmergencyModule {}
