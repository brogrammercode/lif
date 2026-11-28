import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import {
  AdminVehicleCategoryController,
  VehicleCategoryController,
} from './vehicle_category.controller.js';
import { VehicleCategoryRepository } from './vehicle_category.repo.js';
import { VehicleCategoryService } from './vehicle_category.service.js';
@Module({
  imports: [DatabaseModule],
  controllers: [VehicleCategoryController, AdminVehicleCategoryController],
  providers: [VehicleCategoryRepository, VehicleCategoryService],
  exports: [VehicleCategoryRepository, VehicleCategoryService],
})
export class VehicleCategoryModule {}
