import { Module } from '@nestjs/common';
import { EmergencyController } from './emergency.controller.js';
import { EmergencyRepository } from './emergency.repo.js';
import { EmergencyService } from './emergency.service.js';
@Module({
  imports: [],
  controllers: [EmergencyController],
  providers: [EmergencyRepository, EmergencyService],
  exports: [EmergencyRepository, EmergencyService],
})
export class EmergencyModule {}
