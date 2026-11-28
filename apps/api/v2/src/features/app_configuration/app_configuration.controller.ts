import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AdminGuard, AuthGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { AppConfigurationService } from './app_configuration.service.js';
import {
  fare_policy_input,
  support_contact_input,
  type FarePolicyInput,
  type SupportContactInput,
} from './app_configuration.type.js';

@Controller()
@UseGuards(AuthGuard)
export class AppConfigurationController {
  constructor(private readonly service: AppConfigurationService) {}

  @Get('admin/fare-policy')
  @UseGuards(AdminGuard)
  @Header('Cache-Control', 'no-store')
  async fare() {
    return success(await this.service.fare_policy(), 'Fare policy loaded');
  }

  @Patch('admin/fare-policy')
  @UseGuards(AdminGuard)
  async save_fare(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(fare_policy_input)) input: FarePolicyInput,
  ) {
    return success(
      await this.service.save_fare_policy(actorId, input),
      'Fare policy saved',
    );
  }

  @Get('support/configuration')
  @Header('Cache-Control', 'no-store')
  async contacts() {
    return success(
      await this.service.support_contacts(),
      'Support contacts loaded',
    );
  }

  @Get('admin/support/configuration/contact')
  @UseGuards(AdminGuard)
  @Header('Cache-Control', 'no-store')
  async admin_contacts() {
    return success(
      await this.service.support_contacts(true),
      'Support contacts loaded',
    );
  }

  @Patch('admin/support/configuration/contact')
  @UseGuards(AdminGuard)
  async save_contacts(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(support_contact_input))
    input: SupportContactInput,
  ) {
    return success(
      await this.service.save_support_contacts(actorId, input),
      'Support contacts saved',
    );
  }
}
