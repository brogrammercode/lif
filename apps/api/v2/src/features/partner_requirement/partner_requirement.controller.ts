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
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { PartnerRequirementRepository } from './partner_requirement.repo.js';
import {
  requirement_query,
  requirement_id,
  category_input,
  category_update,
  requirement_input,
  requirement_update,
} from './partner_requirement.type.js';
@Controller()
export class PartnerRequirementController {
  constructor(private readonly repo: PartnerRequirementRepository) {}
  @Get('admin/partner-program/requirement-categories')
  @UseGuards(AuthGuard, AdminGuard)
  async categories(
    @Req() _req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.repo.categories(),
      'Requirement categories retrieved',
    );
  }
  @Post('admin/partner-program/requirement-categories')
  @HttpCode(201)
  @UseGuards(AuthGuard, AdminGuard)
  async create_category(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.repo.save_category(
        req.auth!.user_id,
        category_input.parse(req.body),
      ),
      'Requirement category created',
      201,
    );
  }
  @Patch('admin/partner-program/requirement-categories/:id')
  @UseGuards(AuthGuard, AdminGuard)
  async update_category(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.repo.save_category(
        req.auth!.user_id,
        category_update.parse(req.body),
        requirement_id.parse(req.params.id),
      ),
      'Requirement category updated',
    );
  }
  @Get('admin/partner-program/requirements')
  @UseGuards(AuthGuard, AdminGuard)
  async fields(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send_success(
      res,
      await this.repo.list(requirement_query.parse(req.query)),
      'Partner requirements retrieved',
    );
  }
  @Post('admin/partner-program/requirements')
  @HttpCode(201)
  @UseGuards(AuthGuard, AdminGuard)
  async create_field(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.repo.save_field(
        req.auth!.user_id,
        requirement_input.parse(req.body),
      ),
      'Partner requirement created',
      201,
    );
  }
  @Patch('admin/partner-program/requirements/:id')
  @UseGuards(AuthGuard, AdminGuard)
  async update_field(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.repo.save_field(
        req.auth!.user_id,
        requirement_update.parse(req.body),
        requirement_id.parse(req.params.id),
      ),
      'Partner requirement updated',
    );
  }
  @Get('partner-program/requirements')
  @UseGuards(AuthGuard)
  async public_fields(
    @Req() _req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.repo.public_requirements(),
      'Partner program requirements retrieved',
    );
  }
}
