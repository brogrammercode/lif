import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { CATEGORY_MESSAGES } from './vehicle_category.constant.js';
import { VehicleCategoryService } from './vehicle_category.service.js';
import {
  category_schema,
  update_category_schema,
  type CategoryInput,
  type CategoryUpdateInput,
} from './vehicle_category.type.js';

@Controller('vehicle-categories')
@UseGuards(AuthGuard)
export class VehicleCategoryController {
  constructor(private readonly categories: VehicleCategoryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async catalog() {
    return success(
      await this.categories.get_category_catalog(true),
      CATEGORY_MESSAGES.LOADED,
    );
  }
}

@Controller('admin/vehicle-categories')
@UseGuards(AuthGuard, AdminGuard)
export class AdminVehicleCategoryController {
  constructor(private readonly categories: VehicleCategoryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async catalog() {
    return success(
      await this.categories.get_category_catalog(),
      CATEGORY_MESSAGES.LOADED,
    );
  }

  @Post()
  async create(
    @CurrentUserId() actor: string,
    @Body(new ZodValidationPipe(category_schema)) input: CategoryInput,
  ) {
    return success(
      await this.categories.create_category(actor, input),
      CATEGORY_MESSAGES.CREATED,
    );
  }

  @Patch(':id')
  async update(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Body(new ZodValidationPipe(update_category_schema))
    input: CategoryUpdateInput,
  ) {
    return success(
      await this.categories.update_category(actor, id, input),
      CATEGORY_MESSAGES.UPDATED,
    );
  }
}
