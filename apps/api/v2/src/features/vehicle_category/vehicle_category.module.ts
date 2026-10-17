import { Module } from '@nestjs/common';
import { VehicleCategoryController } from './vehicle_category.controller.js';
import { VehicleCategoryRepository } from './vehicle_category.repo.js';
import { VehicleCategoryService } from './vehicle_category.service.js';
@Module({
  imports: [],
  controllers: [VehicleCategoryController],
  providers: [VehicleCategoryRepository, VehicleCategoryService],
  exports: [VehicleCategoryRepository, VehicleCategoryService],
})
export class VehicleCategoryModule {}
