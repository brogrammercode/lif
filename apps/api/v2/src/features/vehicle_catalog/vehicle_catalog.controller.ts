import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, AdminGuard, DriverAccessGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import {
  CatalogImportService,
  catalog_import_input,
} from './catalog_import.service.js';
import { VehicleCatalogRepository } from './vehicle_catalog.repo.js';
import { VehicleCatalogService } from './vehicle_catalog.service.js';
import {
  catalog_query,
  catalog_id,
  brand_input,
  brand_update,
  brand_request,
  model_input,
  model_update,
  model_request,
} from './vehicle_catalog.type.js';

const requestDefaults = {
  status: 'REQUESTED',
  is_active: true,
  rejection_reason: null,
} as const;
const brand_correction = brand_request.extend({
  expected_updated_at: brand_update.shape.expected_updated_at,
});
const model_correction = model_request.extend({
  expected_updated_at: model_update.shape.expected_updated_at,
});

@Controller()
@UseGuards(AuthGuard)
export class VehicleCatalogController {
  constructor(
    private readonly repo: VehicleCatalogRepository,
    private readonly service: VehicleCatalogService,
    private readonly importer: CatalogImportService,
  ) {}

  @Get('driver/catalog-requests')
  async own_requests(
    @CurrentUserId() user: string,
    @Query(new ZodValidationPipe(catalog_query))
    input: z.output<typeof catalog_query>,
  ) {
    return success(
      await this.repo.own_requests(user, input),
      'Your catalog requests loaded',
    );
  }

  @Patch('driver/vehicle-brands/requests/:id')
  @UseGuards(DriverAccessGuard)
  async correct_brand(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(catalog_id)) id: string,
    @Body(new ZodValidationPipe(brand_correction))
    input: z.output<typeof brand_correction>,
  ) {
    return success(
      await this.service.save_brand(
        user,
        { ...input, ...requestDefaults },
        id,
        true,
      ),
      'Brand correction submitted',
    );
  }

  @Patch('driver/vehicle-models/requests/:id')
  @UseGuards(DriverAccessGuard)
  async correct_model(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(catalog_id)) id: string,
    @Body(new ZodValidationPipe(model_correction))
    input: z.output<typeof model_correction>,
  ) {
    return success(
      await this.service.save_model(
        user,
        { ...input, ...requestDefaults },
        id,
        true,
      ),
      'Model correction submitted',
    );
  }

  @Post('admin/vehicle-catalog/import')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async import_catalog(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(catalog_import_input))
    input: z.output<typeof catalog_import_input>,
  ) {
    return success(
      await this.importer.import(user, input),
      'Import batch completed',
    );
  }

  @Get('admin/vehicle-brands')
  @UseGuards(AdminGuard)
  async brands(
    @Query(new ZodValidationPipe(catalog_query))
    input: z.output<typeof catalog_query>,
  ) {
    return success(
      await this.repo.list_brands(input),
      'Vehicle brands retrieved',
    );
  }

  @Get('admin/vehicle-models')
  @UseGuards(AdminGuard)
  async models(
    @Query(new ZodValidationPipe(catalog_query))
    input: z.output<typeof catalog_query>,
  ) {
    return success(
      await this.repo.list_models(input),
      'Vehicle models retrieved',
    );
  }

  @Post('admin/vehicle-brands')
  @UseGuards(AdminGuard)
  async create_brand(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(brand_input))
    input: z.output<typeof brand_input>,
  ) {
    return success(
      await this.service.save_brand(user, input),
      'Vehicle brand created',
    );
  }

  @Patch('admin/vehicle-brands/:id')
  @UseGuards(AdminGuard)
  async update_brand(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(catalog_id)) id: string,
    @Body(new ZodValidationPipe(brand_update))
    input: z.output<typeof brand_update>,
  ) {
    return success(
      await this.service.save_brand(user, input, id),
      'Vehicle brand updated',
    );
  }

  @Post('admin/vehicle-models')
  @UseGuards(AdminGuard)
  async create_model(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(model_input))
    input: z.output<typeof model_input>,
  ) {
    return success(
      await this.service.save_model(user, input),
      'Vehicle model created',
    );
  }

  @Patch('admin/vehicle-models/:id')
  @UseGuards(AdminGuard)
  async update_model(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(catalog_id)) id: string,
    @Body(new ZodValidationPipe(model_update))
    input: z.output<typeof model_update>,
  ) {
    return success(
      await this.service.save_model(user, input, id),
      'Vehicle model updated',
    );
  }

  @Get('vehicle-brands')
  async brand_choices(
    @Query(new ZodValidationPipe(catalog_query))
    input: z.output<typeof catalog_query>,
  ) {
    return success(
      await this.repo.list_brands(input, true),
      'Verified vehicle brands retrieved',
    );
  }

  @Get('vehicle-models')
  async model_choices(
    @Query(new ZodValidationPipe(catalog_query))
    input: z.output<typeof catalog_query>,
  ) {
    return success(
      await this.repo.list_models(input, true),
      'Verified vehicle models retrieved',
    );
  }

  @Post('driver/vehicle-brands/requests')
  @UseGuards(DriverAccessGuard)
  async request_brand(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(brand_request))
    input: z.output<typeof brand_request>,
  ) {
    return success(
      await this.service.save_brand(
        user,
        { ...input, ...requestDefaults },
        undefined,
        true,
      ),
      'Brand request submitted',
    );
  }

  @Post('driver/vehicle-models/requests')
  @UseGuards(DriverAccessGuard)
  async request_model(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(model_request))
    input: z.output<typeof model_request>,
  ) {
    return success(
      await this.service.save_model(
        user,
        { ...input, ...requestDefaults },
        undefined,
        true,
      ),
      'Model request submitted',
    );
  }
}
