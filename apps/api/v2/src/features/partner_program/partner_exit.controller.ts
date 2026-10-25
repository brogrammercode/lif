import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { background_mail } from '../../infra/mail/background.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { PartnerExitService } from './partner_exit.service.js';
import { PartnerDeliveryService } from './partner_delivery.service.js';
import { asset_input, id_input } from './partner_program.type.js';
import {
  exit_create_input,
  admin_exit_create_input,
  exit_review_input,
  exit_list_input,
} from './partner_exit.type.js';

@Controller('partner-program')
@UseGuards(AuthGuard)
export class PartnerExitController {
  constructor(private readonly service: PartnerExitService) {}
  @Get('exit-request') async mine(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const row = await this.service.mine(req.auth!.user_id);
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.create(
        req.auth!.user_id,
        exit_create_input.parse(req.body),
      ),
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.list(exit_list_input.parse(req.query)),
      'Exit requests loaded',
    );
  }
  @Post() async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = admin_exit_create_input.parse(req.body);
    return send_success(
      res,
      await this.service.create(
        req.auth!.user_id,
        { reason: input.reason, version: input.version },
        input.application_id,
      ),
      'Exit request created',
    );
  }
  @Get(':id') async detail(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.detail(id_input.parse(req.params.id)),
      'Exit request loaded',
    );
  }
  @Patch(':id') async review(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.review(
      req.auth!.user_id,
      id_input.parse(req.params.id),
      exit_review_input.parse(req.body),
    );
    if (result.status === 'COMPLETED') this.queue_email(result.application_id);
    return send_success(res, result, 'Exit request saved');
  }
  @Post(':id/assets') async upload(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.upload(
        req.auth!.user_id,
        id_input.parse(req.params.id),
        asset_input.parse(req.body),
      ),
      'Settlement PDF saved',
    );
  }
  @Post(':id/shared') async shared(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.shared(
        req.auth!.user_id,
        id_input.parse(req.params.id),
      ),
      'Manual sharing recorded',
    );
  }
  @Post(':id/email-retry') async retry(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const application_id = await this.service.retry_email(
      req.auth!.user_id,
      id_input.parse(req.params.id),
    );
    this.queue_email(application_id);
    return send_success(res, { queued: true }, 'Settlement email retry queued');
  }
}
