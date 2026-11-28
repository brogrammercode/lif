import type { output as ZodOutput } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  Controller,
  Get,
  Post,
  Patch,
  Res,
  UseGuards,
  Query,
  Body,
  Param,
} from '@nestjs/common';
import type { Response } from 'express';
import { background_mail } from '../../infra/mail/background.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { PartnerExitService } from './partner_exit.service.js';
import { PartnerDeliveryService } from './partner_delivery.service.js';
import { asset_input, id_input } from './dto/partner-program.dto.js';
import {
  exit_create_input,
  admin_exit_create_input,
  exit_review_input,
  exit_list_input,
  exit_mine_query,
} from './dto/partner-exit.dto.js';

@Controller('partner-program')
@UseGuards(AuthGuard)
export class PartnerExitController {
  constructor(private readonly service: PartnerExitService) {}
  @Get('exit-request') async mine(
    @Query(new ZodValidationPipe(exit_mine_query))
    filters: ZodOutput<typeof exit_mine_query>,
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (filters.history) {
      return send_success(
        res,
        await this.service.history(actorId, filters.after),
        'Partner exit history loaded',
      );
    }
    const row = await this.service.mine(actorId);
    // Internal review notes and reviewer identities stay in the admin workspace.
    return send_success(
      res,
      row
        ? {
            id: row.id,
            status: row.status,
            version: row.version,
            reason: row.reason,
            rejection_reason: row.rejection_reason,
            dues_amount: row.dues_amount,
            dues_direction: row.dues_direction,
            currency: row.currency,
            settlement_pdf_id: row.settlement_pdf_id,
            completed_at: row.completed_at,
            created_at: row.created_at,
          }
        : null,
      'Exit request loaded',
    );
  }
  @Post('exit-request') async create(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(exit_create_input))
    input: ZodOutput<typeof exit_create_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.create(actorId, input),
      'Exit request submitted',
    );
  }
}
@Controller('admin/partner-program/exit-requests')
@UseGuards(AuthGuard, AdminGuard)
export class AdminPartnerExitController {
  constructor(
    private readonly service: PartnerExitService,
    private readonly delivery: PartnerDeliveryService,
  ) {}
  private queue_email(application_id: string) {
    background_mail(
      this.delivery.send_exit_email(application_id),
      'PARTNER_EXIT_EMAIL_JOB_FAILED',
      application_id,
    );
  }
  @Get() async list(
    @Query(new ZodValidationPipe(exit_list_input))
    filters: ZodOutput<typeof exit_list_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.list(filters),
      'Exit requests loaded',
    );
  }
  @Post() async create(
    @Body(new ZodValidationPipe(admin_exit_create_input))
    validatedInput: ZodOutput<typeof admin_exit_create_input>,
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validatedInput;
    return send_success(
      res,
      await this.service.create(
        actorId,
        { reason: input.reason, version: input.version },
        input.application_id,
      ),
      'Exit request created',
    );
  }
  @Get(':id') async detail(
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.detail(routeId),
      'Exit request loaded',
    );
  }
  @Patch(':id') async review(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Body(new ZodValidationPipe(exit_review_input))
    input: ZodOutput<typeof exit_review_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.review(actorId, routeId, input);
    if (result.status === 'COMPLETED') this.queue_email(result.application_id);
    return send_success(res, result, 'Exit request saved');
  }
  @Post(':id/assets') async upload(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Body(new ZodValidationPipe(asset_input))
    input: ZodOutput<typeof asset_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.upload(actorId, routeId, input),
      'Settlement PDF saved',
    );
  }
  @Post(':id/shared') async shared(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.shared(actorId, routeId),
      'Manual sharing recorded',
    );
  }
  @Post(':id/email-retry') async retry(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const application_id = await this.service.retry_email(actorId, routeId);
    this.queue_email(application_id);
    return send_success(res, { queued: true }, 'Settlement email retry queued');
  }
}
