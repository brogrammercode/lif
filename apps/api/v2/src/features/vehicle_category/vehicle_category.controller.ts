import {
  Controller,
  HttpCode,
  Req,
  Res,
  Get,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { VehicleCategoryService } from './vehicle_category.service.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { VEHICLE_CATEGORY_ROUTES } from './vehicle_category.route.js';
import type { Request, Response } from 'express';
import { send_success } from '../../core/response.js';
import { CATEGORY_MESSAGES } from './vehicle_category.constant.js';
import {
  category_schema,
  update_category_schema,
} from './vehicle_category.type.js';
@Controller()
export class VehicleCategoryController {
  constructor(
    private readonly vehicleCategoryService: VehicleCategoryService,
  ) {}
  @Get(VEHICLE_CATEGORY_ROUTES.CATALOG)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async catalog(
    @Req() _request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return send_success(
      response,
      await this.vehicleCategoryService.get_category_catalog(true),
      CATEGORY_MESSAGES.LOADED,
    );
  }

  @Get(VEHICLE_CATEGORY_ROUTES.ADMIN_CATALOG)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async admin_catalog(
    @Req() _request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return send_success(
      response,
      await this.vehicleCategoryService.get_category_catalog(),
      CATEGORY_MESSAGES.LOADED,
    );
  }

  @Post(VEHICLE_CATEGORY_ROUTES.CREATE)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.vehicleCategoryService.create_category(
        request.auth!.user_id,
        category_schema.parse(request.body),
      ),
      CATEGORY_MESSAGES.CREATED,
      201,
    );
  }

  @Patch(VEHICLE_CATEGORY_ROUTES.UPDATE)
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  async update(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.vehicleCategoryService.update_category(
        request.auth!.user_id,
        request.params.id as string,
        update_category_schema.parse(request.body),
      ),
      CATEGORY_MESSAGES.UPDATED,
    );
  }
}
