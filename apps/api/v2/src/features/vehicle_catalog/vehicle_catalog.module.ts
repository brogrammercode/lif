import { CatalogImportService } from './catalog_import.service.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { VehicleCatalogController } from './vehicle_catalog.controller.js';
import { VehicleCatalogRepository } from './vehicle_catalog.repo.js';
import { VehicleCatalogService } from './vehicle_catalog.service.js';
@Module({
  imports: [DatabaseModule],
  controllers: [VehicleCatalogController],
  providers: [
    VehicleCatalogRepository,
    VehicleCatalogService,
    CatalogImportService,
  ],
})
export class VehicleCatalogModule {}
