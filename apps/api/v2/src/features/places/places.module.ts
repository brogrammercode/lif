import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { PlacesController } from './places.controller.js';
import { PlacesRepository } from './places.repo.js';
import { PlacesService } from './places.service.js';
@Module({
  imports: [DatabaseModule],
  controllers: [PlacesController],
  providers: [PlacesRepository, PlacesService],
})
export class PlacesModule {}
