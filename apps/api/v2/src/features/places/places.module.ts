import { Module } from '@nestjs/common';
import { PlacesController } from './places.controller.js';
import { PlacesRepository } from './places.repo.js';
import { PlacesService } from './places.service.js';
@Module({
  controllers: [PlacesController],
  providers: [PlacesRepository, PlacesService],
})
export class PlacesModule {}
