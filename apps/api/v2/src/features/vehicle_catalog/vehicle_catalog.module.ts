import { CatalogImportService } from './catalog_import.service.js';
import { Module } from '@nestjs/common';
import { VehicleCatalogController } from './vehicle_catalog.controller.js';
import { VehicleCatalogRepository } from './vehicle_catalog.repo.js';
import { VehicleCatalogService } from './vehicle_catalog.service.js';
@Module({
  controllers: [VehicleCatalogController],
  providers: [
    VehicleCatalogRepository,
    VehicleCatalogService,
    CatalogImportService,
  ],
})
export class VehicleCatalogModule {}
