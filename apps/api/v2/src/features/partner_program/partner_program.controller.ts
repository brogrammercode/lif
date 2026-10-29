import { schedule_new_user_emails } from '../../infra/mail/new_user_email.js';
import { PARTNER_EMAIL_TITLE } from '../../infra/mail/partner_email.js';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  PartnerApplicationDeletionService,
  application_delete_input,
} from './partner_application_deletion.service.js';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { background_mail } from '../../infra/mail/background.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { AppError } from '../../core/error.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { PartnerProgramService } from './partner_program.service.js';
import { PartnerDocumentService } from './partner_document.service.js';
import { PartnerDeliveryService } from './partner_delivery.service.js';
import {
  activation_input,
  application_input,
  asset_input,
  confirmation_input,
  document_input,
  document_kind,
  id_input,
  list_input,
  review_input,
} from './partner_program.type.js';
import { postal_directory } from './postal-directory.data.js';

@Controller('partner-program')
@UseGuards(AuthGuard)
export class PartnerProgramController {
  constructor(private readonly service: PartnerProgramService) {}
  @Get('geography') async geography(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = z
      .object({
        state: z.string().trim().max(120).optional(),
        city: z.string().trim().max(120).optional(),
        pincode: z
          .string()
          .regex(/^[1-9]\d{5}$/)
          .optional(),
      })
      .parse(req.query);
    const matches = Object.entries(postal_directory).flatMap(
      ([state, cities]) =>
        input.state && input.state !== state
          ? []
          : Object.entries(cities)
              .filter(
                ([city, pins]) =>
                  (!input.city || input.city === city) &&
                  (!input.pincode || pins.includes(input.pincode)),
              )
              .map(([city]) => ({ state, city })),
    );
    if (!matches.length)
      throw new AppError(
        422,
        'ADDRESS_SELECTION_INVALID',
        'Choose matching state, city and PIN code values from the available options.',
      );
    // Restore saved city/PIN answers only when their geography is unambiguous.
    const states = [...new Set(matches.map((match) => match.state))];
    const state = input.state ?? (states.length === 1 ? states[0] : undefined);
    const city_names = [
      ...new Set(
        matches
          .filter((match) => match.state === state)
          .map((match) => match.city),
      ),
    ];
    const city =
      input.city ??
      (city_names.length === 1 && input.pincode ? city_names[0] : undefined);
    const cities = state ? postal_directory[state] : undefined;
    return send_success(
      res,
      {
        states: Object.keys(postal_directory),
        cities: cities ? Object.keys(cities) : [],
        pincodes:
          city && cities && Object.hasOwn(cities, city) ? cities[city] : [],
        selected_state: state ?? null,
        selected_city: state ? (city ?? null) : null,
        matching_states: states,
      },
      'Postal address options loaded',
    );
  }
  @Get('me') async me(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.service.workflow(req.auth!.user_id),
      'Partner program loaded',
    );
  }
  @Post('applications') async submit(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.submit(
        req.auth!.user_id,
        application_input.parse(req.body),
      ),
      'Application submitted',
    );
  }
  @Post('confirmations') async confirm(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.confirm(
        req.auth!.user_id,
        confirmation_input.parse(req.body),
      ),
      'Confirmation submitted',
    );
  }
  @Post('assets') async upload(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.store_asset(
        req.auth!.user_id,
        asset_input.parse(req.body),
      ),
      'File saved',
    );
  }
  @Get('assets/:id') async asset(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const asset = await this.service.asset(
      req.auth!.user_id,
      id_input.parse(req.params.id),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return send_success(
      res,
      {
        id: asset.id,
        file_name: asset.file_name,
        mime_type: asset.mime_type,
        data_url: `data:${asset.mime_type};base64,${Buffer.from(asset.content).toString('base64')}`,
      },
      'Private file retrieved',
    );
  }
  @Post('activate') async activate(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.activate(
        req.auth!.user_id,
        activation_input.parse(req.body).code,
      ),
      'Driver activated',
    );
  }
}

@Controller('admin/partner-program')
@UseGuards(AuthGuard, AdminGuard)
export class AdminPartnerProgramController {
  constructor(
    private readonly service: PartnerProgramService,
    private readonly documents: PartnerDocumentService,
    private readonly delivery: PartnerDeliveryService,
    private readonly database: PrismaService,
    private readonly deletion: PartnerApplicationDeletionService,
  ) {}
  @Get('applications/:id/deletion-preview') async deletion_preview(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.deletion.preview(
        req.auth!.user_id,
        id_input.parse(req.params.id),
      ),
      'Application deletion preview loaded',
    );
  }
  @Delete('applications/:id') async delete_application(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.deletion.remove(
        req.auth!.user_id,
        id_input.parse(req.params.id),
        application_delete_input.parse(req.body),
      ),
      'Application and related data deleted',
    );
  }
  private queue_email(id: string) {
    background_mail(
      this.delivery.send_email(id),
      'PARTNER_EMAIL_JOB_FAILED',
      id,
    );
  }
  @Post('applications/:id/notifications/retry') async retry_notifications(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = id_input.parse(req.params.id);
    const result = await this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, req.auth!.user_id);
      const app = await tx.partnerApplication.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!app)
        throw new AppError(
          404,
          'APPLICATION_NOT_FOUND',
          'Application not found.',
        );
      const rows = await tx.notification.findMany({
        where: {
          channel: 'EMAIL',
          type: 'SYSTEM',
          title: PARTNER_EMAIL_TITLE,
          sent_at: null,
          AND: [
            { data: { path: ['kind'], equals: 'PARTNER_LIFECYCLE_EMAIL' } },
            { data: { path: ['application_id'], equals: id } },
            {
              OR: [
                { data: { path: ['state'], equals: 'FAILED' } },
                { data: { path: ['state'], equals: 'PENDING' } },
                { updated_at: { lt: new Date(Date.now() - 300000) } },
              ],
            },
          ],
        },
        take: 50,
      });
      let queued = 0;
      for (const row of rows) {
        const data = row.data as Record<string, unknown>;
        const update = await tx.notification.updateMany({
          where: {
            id: row.id,
            updated_at: row.updated_at,
            sent_at: null,
            data: { equals: row.data as Prisma.InputJsonValue },
          },
          data: {
            data: {
              ...data,
              state: 'PENDING',
              last_error: null,
            } as Prisma.InputJsonObject,
          },
        });
        queued += update.count;
      }
      await create_user_log(tx, {
        actor_id: req.auth!.user_id,
        entity_type: 'PartnerApplication',
        entity_id: id,
        action: 'RETRY_PARTNER_NOTIFICATIONS',
        after_data: { queued },
      });
      return { queued };
    });
    schedule_new_user_emails();
    return send_success(res, result, 'Queued email delivery will be retried');
  }
  @Get('documents/:kind') async document(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.documents.get(document_kind.parse(req.params.kind)),
      'Document loaded',
    );
  }
  @Patch('documents/:kind') async save_document(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.documents.save(
        req.auth!.user_id,
        document_kind.parse(req.params.kind),
        document_input.parse(req.body),
      ),
      'Document saved',
    );
  }
  @Get('applications') async list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.list(list_input.parse(req.query)),
      'Applications retrieved',
    );
  }
  @Get('applications/:id') async detail(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.service.detail(id_input.parse(req.params.id)),
      'Application loaded',
    );
  }
  @Patch('applications/:id/fields/:fieldId') async field(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.review_field(
        req.auth!.user_id,
        id_input.parse(req.params.id),
        id_input.parse(req.params.fieldId),
        review_input.parse(req.body),
      ),
      'Field reviewed',
    );
  }
  @Post('applications/:id/request-selfie') async request_selfie(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(req.body);
    return send_success(
      res,
      await this.service.request_selfie(
        req.auth!.user_id,
        id_input.parse(req.params.id),
        input.version,
      ),
      'Live selfie requested',
    );
  }
  @Post('applications/:id/approve') async approve(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.approve_application(
        req.auth!.user_id,
        id_input.parse(req.params.id),
        review_input.parse(req.body),
      ),
      'Application approved',
    );
  }
  @Post('applications/:id/confirmation-review') async confirmation_review(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = id_input.parse(req.params.id);
    const result = await this.service.review_confirmation(
      req.auth!.user_id,
      id,
      review_input.parse(req.body),
    );
    if (result.status === 'COMPLETED') this.queue_email(id);
    return send_success(res, result, 'Confirmation reviewed');
  }
  @Post('assets') async upload(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.store_asset(
        req.auth!.user_id,
        asset_input.parse(req.body),
        true,
      ),
      'Final PDF saved',
    );
  }
  @Post('applications/:id/email-retry') async retry(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = id_input.parse(req.params.id);
    await this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, req.auth!.user_id);
      const application = await tx.partnerApplication.findUnique({
        where: { id },
        select: { status: true, final_pdf_id: true },
      });
      if (!application)
        throw new AppError(
          404,
          'APPLICATION_NOT_FOUND',
          'Application not found.',
        );
      if (
        !['COMPLETED', 'ACTIVATED'].includes(application.status) ||
        !application.final_pdf_id
      )
        throw new AppError(
          409,
          'PARTNER_EMAIL_NOT_READY',
          'Approve the final PDF before retrying email delivery.',
        );
      await create_user_log(tx, {
        actor_id: req.auth!.user_id,
        entity_type: 'PartnerApplication',
        entity_id: id,
        action: 'RETRY_PARTNER_EMAIL',
      });
    });
    this.queue_email(id);
    return send_success(res, { queued: true }, 'Email retry queued');
  }
  @Post('applications/:id/shared') async shared(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.mark_shared(
        req.auth!.user_id,
        id_input.parse(req.params.id),
      ),
      'Manual sharing recorded',
    );
  }
  @Post('applications/:id/activation-code') async code(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.service.activation_code(
        req.auth!.user_id,
        id_input.parse(req.params.id),
      ),
      'Activation code retrieved',
    );
  }
  @Post('applications/:id/activation-email') async activation_email(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = id_input.parse(req.params.id);
    const result = await this.service.queue_activation_email(
      req.auth!.user_id,
      id,
    );
    background_mail(
      this.delivery.send_activation_email(id),
      'PARTNER_ACTIVATION_EMAIL_JOB_FAILED',
      id,
    );
    return send_success(res, result, 'Activation email queued');
  }
  @Post('applications/:id/activation-shared') async activation_shared(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.mark_activation_shared(
        req.auth!.user_id,
        id_input.parse(req.params.id),
      ),
      'Manual activation sharing recorded',
    );
  }
  @Post('applications/:id/activation-unlock') async unlock(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.service.activation_code(
        req.auth!.user_id,
        id_input.parse(req.params.id),
        true,
      ),
      'Activation unlocked',
    );
  }
}
