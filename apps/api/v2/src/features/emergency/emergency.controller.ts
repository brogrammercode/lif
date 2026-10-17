import {
  Controller,
  HttpCode,
  Req,
  Res,
  Get,
  Post,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { EmergencyService } from './emergency.service.js';
import { AuthGuard } from '../../core/guards.js';
import { EMERGENCY_ROUTES } from './emergency.route.js';
import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import {
  EMERGENCY_CONTACT_CREATED_MESSAGE,
  EMERGENCY_CONTACT_DELETED_MESSAGE,
  EMERGENCY_CONTACTS_LOADED_MESSAGE,
  EMERGENCY_CONTACT_UPDATED_MESSAGE,
} from './emergency.constant.js';
import { emergency_contact_schema } from './emergency.type.js';
@Controller()
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}
  readonly current_user_id = (request: Request): string => {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    return request.auth.user_id;
  };

  @Get(EMERGENCY_ROUTES.LIST)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.emergencyService.get_emergency_contacts(
        this.current_user_id(request),
      ),
      EMERGENCY_CONTACTS_LOADED_MESSAGE,
    );
  }

  @Post(EMERGENCY_ROUTES.CREATE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.emergencyService.add_emergency_contact(
        this.current_user_id(request),
        emergency_contact_schema.parse(request.body),
      ),
      EMERGENCY_CONTACT_CREATED_MESSAGE,
      201,
    );
  }

  @Patch(EMERGENCY_ROUTES.UPDATE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async update(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.emergencyService.edit_emergency_contact(
        this.current_user_id(request),
        request.params.id as string,
        emergency_contact_schema.parse(request.body),
      ),
      EMERGENCY_CONTACT_UPDATED_MESSAGE,
    );
  }

  @Delete(EMERGENCY_ROUTES.REMOVE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async remove(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.emergencyService.remove_emergency_contact(
      this.current_user_id(request),
      request.params.id as string,
    );
    return send_success(response, null, EMERGENCY_CONTACT_DELETED_MESSAGE);
  }
}
