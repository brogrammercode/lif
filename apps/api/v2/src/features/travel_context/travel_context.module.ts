import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { TravelContextController } from './travel_context.controller.js';
import { TravelContextService } from './travel_context.service.js';
import { TravelContextRepository } from './travel-context.repository.js';
@Module({
  imports: [DatabaseModule],
  controllers: [TravelContextController],
  providers: [TravelContextService, TravelContextRepository],
})
export class TravelContextModule {}
