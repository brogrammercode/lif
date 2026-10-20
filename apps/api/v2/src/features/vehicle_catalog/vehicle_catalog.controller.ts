import {
  CatalogImportService,
  catalog_import_input,
} from './catalog_import.service.js';
import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard, AdminGuard, DriverAccessGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
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
@Controller()
export class VehicleCatalogController {
  constructor(
    private readonly repo: VehicleCatalogRepository,
    private readonly service: VehicleCatalogService,
    private readonly importer: CatalogImportService,
  ) {}
  @Post('admin/vehicle-catalog/import')
  @UseGuards(AuthGuard, AdminGuard)
  async import_catalog(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.importer.import(
        req.auth!.user_id,
        catalog_import_input.parse(req.body),
      ),
      'Import batch completed',
    );
  }
  @Get('admin/vehicle-brands')
  @UseGuards(AuthGuard, AdminGuard)
  async brands(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.repo.list_brands(catalog_query.parse(req.query)),
      'Vehicle brands retrieved',
    );
  }
  @Get('admin/vehicle-models')
  @UseGuards(AuthGuard, AdminGuard)
  async models(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.repo.list_models(catalog_query.parse(req.query)),
      'Vehicle models retrieved',
    );
  }
  @Post('admin/vehicle-brands')
  @HttpCode(201)
  @UseGuards(AuthGuard, AdminGuard)
  async create_brand(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.save_brand(
        req.auth!.user_id,
        brand_input.parse(req.body),
      ),
      'Vehicle brand created',
      201,
    );
  }
  @Patch('admin/vehicle-brands/:id')
  @UseGuards(AuthGuard, AdminGuard)
  async update_brand(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.save_brand(
        req.auth!.user_id,
        brand_update.parse(req.body),
        catalog_id.parse(req.params.id),
      ),
      'Vehicle brand updated',
    );
  }
  @Post('admin/vehicle-models')
  @HttpCode(201)
  @UseGuards(AuthGuard, AdminGuard)
  async create_model(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.save_model(
        req.auth!.user_id,
        model_input.parse(req.body),
      ),
      'Vehicle model created',
      201,
    );
  }
  @Patch('admin/vehicle-models/:id')
  @UseGuards(AuthGuard, AdminGuard)
  async update_model(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.save_model(
        req.auth!.user_id,
        model_update.parse(req.body),
        catalog_id.parse(req.params.id),
      ),
      'Vehicle model updated',
    );
  }
  @Get('vehicle-brands')
  @UseGuards(AuthGuard)
  async brand_choices(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.repo.list_brands(catalog_query.parse(req.query), true),
      'Verified vehicle brands retrieved',
    );
  }
  @Get('vehicle-models')
  @UseGuards(AuthGuard)
  async model_choices(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.repo.list_models(catalog_query.parse(req.query), true),
      'Verified vehicle models retrieved',
    );
  }
  @Post('driver/vehicle-brands/requests')
  @HttpCode(201)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async request_brand(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.save_brand(
        req.auth!.user_id,
        {
          ...brand_request.parse(req.body),
          status: 'REQUESTED',
          is_active: true,
          rejection_reason: null,
        },
        undefined,
        true,
      ),
      'Brand request submitted',
      201,
    );
  }
  @Post('driver/vehicle-models/requests')
  @HttpCode(201)
  @UseGuards(AuthGuard, DriverAccessGuard)
  async request_model(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.save_model(
        req.auth!.user_id,
        {
          ...model_request.parse(req.body),
          status: 'REQUESTED',
          is_active: true,
          rejection_reason: null,
        },
        undefined,
        true,
      ),
      'Model request submitted',
      201,
    );
  }
}
