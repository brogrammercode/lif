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
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { DriverAccountService } from './driver_account.service.js';
import {
  finance_query,
  payout_request,
  payout_review,
} from './driver_account.type.js';
import { catalog_id } from '../vehicle_catalog/vehicle_catalog.type.js';

@Controller()
@UseGuards(AuthGuard)
export class DriverAccountController {
  constructor(private readonly service: DriverAccountService) {}

  @Get('driver/account')
  async account(@CurrentUserId() user: string) {
    return success(await this.service.account(user), 'Driver account loaded');
  }

  @Get('driver/finances')
  async finance(
    @CurrentUserId() user: string,
    @Query(new ZodValidationPipe(finance_query))
    input: z.output<typeof finance_query>,
  ) {
    return success(
      await this.service.finance(user, input),
      'Driver statement loaded',
    );
  }

  @Post('driver/payout-changes')
  @HttpCode(200)
  async request(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(payout_request))
    input: z.output<typeof payout_request>,
  ) {
    return success(
      await this.service.request(user, input),
      'Account change submitted',
    );
  }

  @Get('admin/users/:id/driver-account')
  @UseGuards(AdminGuard)
  async admin_account(
    @Param('id', new ZodValidationPipe(catalog_id)) id: string,
  ) {
    return success(await this.service.account(id), 'Driver account loaded');
  }

  @Get('admin/users/:id/driver-finances')
  @UseGuards(AdminGuard)
  async admin_finance(
    @Param('id', new ZodValidationPipe(catalog_id)) id: string,
    @Query(new ZodValidationPipe(finance_query))
    input: z.output<typeof finance_query>,
  ) {
    return success(
      await this.service.finance(id, input),
      'Driver statement loaded',
    );
  }

  @Get('admin/payout-changes/:id/private')
  @UseGuards(AdminGuard)
  async reveal(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(catalog_id)) id: string,
  ) {
    return success(
      await this.service.reveal(actor, id),
      'Private account details loaded',
    );
  }

  @Patch('admin/payout-changes/:id')
  @UseGuards(AdminGuard)
  async review(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(catalog_id)) id: string,
    @Body(new ZodValidationPipe(payout_review))
    input: z.output<typeof payout_review>,
  ) {
    return success(
      await this.service.review(actor, id, input),
      'Account change reviewed',
    );
  }
}
