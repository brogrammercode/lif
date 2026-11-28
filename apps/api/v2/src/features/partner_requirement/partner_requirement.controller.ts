import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { PartnerRequirementRepository } from './partner_requirement.repo.js';
import {
  requirement_query,
  requirement_id,
  category_input,
  category_update,
  requirement_input,
  requirement_update,
  requirement_delete,
  type CategoryInput,
  type RequirementInput,
  type RequirementQuery,
} from './partner_requirement.type.js';

@Controller()
@UseGuards(AuthGuard)
export class PartnerRequirementController {
  constructor(private readonly repo: PartnerRequirementRepository) {}

  @Delete('admin/partner-program/requirement-categories/:id')
  @UseGuards(AdminGuard)
  async delete_category(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(requirement_id)) id: string,
    @Body(new ZodValidationPipe(requirement_delete))
    body: { expected_updated_at: string },
  ) {
    return success(
      await this.repo.remove(actor, id, body.expected_updated_at, true),
      'Category and its fields deleted',
    );
  }

  @Delete('admin/partner-program/requirements/:id')
  @UseGuards(AdminGuard)
  async delete_field(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(requirement_id)) id: string,
    @Body(new ZodValidationPipe(requirement_delete))
    body: { expected_updated_at: string },
  ) {
    return success(
      await this.repo.remove(actor, id, body.expected_updated_at),
      'Requirement deleted',
    );
  }

  @Get('admin/partner-program/requirement-categories')
  @UseGuards(AdminGuard)
  async categories() {
    return success(
      await this.repo.categories(),
      'Requirement categories retrieved',
    );
  }

  @Post('admin/partner-program/requirement-categories')
  @UseGuards(AdminGuard)
  async create_category(
    @CurrentUserId() actor: string,
    @Body(new ZodValidationPipe(category_input)) input: CategoryInput,
  ) {
    return success(
      await this.repo.save_category(actor, input),
      'Requirement category created',
    );
  }

  @Patch('admin/partner-program/requirement-categories/:id')
  @UseGuards(AdminGuard)
  async update_category(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(requirement_id)) id: string,
    @Body(new ZodValidationPipe(category_update)) input: CategoryInput,
  ) {
    return success(
      await this.repo.save_category(actor, input, id),
      'Requirement category updated',
    );
  }

  @Get('admin/partner-program/requirements')
  @UseGuards(AdminGuard)
  async fields(
    @Query(new ZodValidationPipe(requirement_query)) input: RequirementQuery,
  ) {
    return success(
      await this.repo.list(input),
      'Partner requirements retrieved',
    );
  }

  @Post('admin/partner-program/requirements')
  @UseGuards(AdminGuard)
  async create_field(
    @CurrentUserId() actor: string,
    @Body(new ZodValidationPipe(requirement_input)) input: RequirementInput,
  ) {
    return success(
      await this.repo.save_field(actor, input),
      'Partner requirement created',
    );
  }

  @Patch('admin/partner-program/requirements/:id')
  @UseGuards(AdminGuard)
  async update_field(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(requirement_id)) id: string,
    @Body(new ZodValidationPipe(requirement_update)) input: RequirementInput,
  ) {
    return success(
      await this.repo.save_field(actor, input, id),
      'Partner requirement updated',
    );
  }

  @Get('partner-program/requirements')
  async public_fields() {
    return success(
      await this.repo.public_requirements(),
      'Partner program requirements retrieved',
    );
  }
}
