import { Module } from '@nestjs/common';
import { TravelContextController } from './travel_context.controller.js';
import { TravelContextService } from './travel_context.service.js';
@Module({
  controllers: [TravelContextController],
  providers: [TravelContextService],
})
export class TravelContextModule {}
