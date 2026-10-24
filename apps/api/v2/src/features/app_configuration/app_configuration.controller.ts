import { Controller, Get, Patch, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminGuard, AuthGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { AppConfigurationService } from './app_configuration.service.js';
import {
  fare_policy_input,
  support_contact_input,
} from './app_configuration.type.js';

@Controller()
export class AppConfigurationController {
  constructor(private readonly service: AppConfigurationService) {}
  @Get('admin/fare-policy')
  @UseGuards(AuthGuard, AdminGuard)
  async fare(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return send_success(
      response,
      await this.service.fare_policy(),
      'Fare policy loaded',
    );
  }
  @Patch('admin/fare-policy')
  @UseGuards(AuthGuard, AdminGuard)
  async save_fare(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.service.save_fare_policy(
        request.auth!.user_id,
        fare_policy_input.parse(request.body),
      ),
      'Fare policy saved',
    );
  }
  @Get('support/configuration')
  @UseGuards(AuthGuard)
  async contacts(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return send_success(
      response,
      await this.service.support_contacts(),
      'Support contacts loaded',
    );
  }
  @Get('admin/support/configuration/contact')
  @UseGuards(AuthGuard, AdminGuard)
  async admin_contacts(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return send_success(
      response,
      await this.service.support_contacts(true),
      'Support contacts loaded',
    );
  }
  @Patch('admin/support/configuration/contact')
  @UseGuards(AuthGuard, AdminGuard)
  async save_contacts(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.service.save_support_contacts(
        request.auth!.user_id,
        support_contact_input.parse(request.body),
      ),
      'Support contacts saved',
    );
  }
}
