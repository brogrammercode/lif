import type { output as ZodOutput } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
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
import { AppError } from '../../core/error.js';
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
} from './dto/partner-program.dto.js';
import { postal_directory } from './postal-directory.data.js';

const geography_query_schema = z.object({
  state: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  pincode: z
    .string()
    .regex(/^[1-9]\d{5}$/)
    .optional(),
});
const request_selfie_body_schema = z
  .object({ version: z.number().int().positive() })
  .strict();

@Controller('partner-program')
@UseGuards(AuthGuard)
export class PartnerProgramController {
  constructor(private readonly service: PartnerProgramService) {}
  @Get('geography') async geography(
    @Query(new ZodValidationPipe(geography_query_schema))
    filters: ZodOutput<typeof geography_query_schema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = filters;
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
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.service.workflow(actorId),
      'Partner program loaded',
    );
  }
  @Post('applications') async submit(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(application_input))
    input: ZodOutput<typeof application_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.submit(actorId, input),
      'Application submitted',
    );
  }
  @Post('confirmations') async confirm(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(confirmation_input))
    input: ZodOutput<typeof confirmation_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.confirm(actorId, input),
      'Confirmation submitted',
    );
  }
  @Post('assets') async upload(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(asset_input))
    input: ZodOutput<typeof asset_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.store_asset(actorId, input),
      'File saved',
    );
  }
  @Get('assets/:id') async asset(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const asset = await this.service.asset(actorId, routeId);
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
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(activation_input))
    input: ZodOutput<typeof activation_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.activate(actorId, input.code),
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
    private readonly deletion: PartnerApplicationDeletionService,
  ) {}
  @Get('applications/:id/deletion-preview') async deletion_preview(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.deletion.preview(actorId, routeId),
      'Application deletion preview loaded',
    );
  }
  @Delete('applications/:id') async delete_application(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Body(new ZodValidationPipe(application_delete_input))
    input: ZodOutput<typeof application_delete_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.deletion.remove(actorId, routeId, input),
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
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = routeId;
    const result = await this.service.retry_notifications(actorId, id);
    return send_success(res, result, 'Queued email delivery will be retried');
  }
  @Get('documents/:kind') async document(
    @Param('kind', new ZodValidationPipe(document_kind))
    routeKind: ZodOutput<typeof document_kind>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.documents.get(routeKind),
      'Document loaded',
    );
  }
  @Patch('documents/:kind') async save_document(
    @CurrentUserId() actorId: string,
    @Param('kind', new ZodValidationPipe(document_kind))
    routeKind: ZodOutput<typeof document_kind>,
    @Body(new ZodValidationPipe(document_input))
    input: ZodOutput<typeof document_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.documents.save(actorId, routeKind, input),
      'Document saved',
    );
  }
  @Get('applications') async list(
    @Query(new ZodValidationPipe(list_input))
    filters: ZodOutput<typeof list_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.list(filters),
      'Applications retrieved',
    );
  }
  @Get('applications/:id') async detail(
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.service.detail(routeId),
      'Application loaded',
    );
  }
  @Patch('applications/:id/fields/:fieldId') async field(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Param('fieldId', new ZodValidationPipe(id_input))
    routeFieldId: ZodOutput<typeof id_input>,
    @Body(new ZodValidationPipe(review_input))
    input: ZodOutput<typeof review_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.review_field(actorId, routeId, routeFieldId, input),
      'Field reviewed',
    );
  }
  @Post('applications/:id/request-selfie') async request_selfie(
    @Body(new ZodValidationPipe(request_selfie_body_schema))
    validatedInput: ZodOutput<typeof request_selfie_body_schema>,
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validatedInput;
    return send_success(
      res,
      await this.service.request_selfie(actorId, routeId, input.version),
      'Live selfie requested',
    );
  }
  @Post('applications/:id/approve') async approve(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Body(new ZodValidationPipe(review_input))
    input: ZodOutput<typeof review_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.approve_application(actorId, routeId, input),
      'Application approved',
    );
  }
  @Post('applications/:id/confirmation-review') async confirmation_review(
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(review_input))
    input: ZodOutput<typeof review_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = routeId;
    const result = await this.service.review_confirmation(actorId, id, input);
    if (result.status === 'COMPLETED') this.queue_email(id);
    return send_success(res, result, 'Confirmation reviewed');
  }
  @Post('assets') async upload(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(asset_input))
    input: ZodOutput<typeof asset_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.store_asset(actorId, input, true),
      'Final PDF saved',
    );
  }
  @Post('applications/:id/email-retry') async retry(
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = routeId;
    await this.service.authorize_pdf_retry(actorId, id);
    this.queue_email(id);
    return send_success(res, { queued: true }, 'Email retry queued');
  }
  @Post('applications/:id/shared') async shared(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.mark_shared(actorId, routeId),
      'Manual sharing recorded',
    );
  }
  @Post('applications/:id/activation-code') async code(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.service.activation_code(actorId, routeId),
      'Activation code retrieved',
    );
  }
  @Post('applications/:id/activation-email') async activation_email(
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = routeId;
    const result = await this.service.queue_activation_email(actorId, id);
    background_mail(
      this.delivery.send_activation_email(id),
      'PARTNER_ACTIVATION_EMAIL_JOB_FAILED',
      id,
    );
    return send_success(res, result, 'Activation email queued');
  }
  @Post('applications/:id/activation-shared') async activation_shared(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.mark_activation_shared(actorId, routeId),
      'Manual activation sharing recorded',
    );
  }
  @Post('applications/:id/activation-unlock') async unlock(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(id_input))
    routeId: ZodOutput<typeof id_input>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return send_success(
      res,
      await this.service.activation_code(actorId, routeId, true),
      'Activation unlocked',
    );
  }
}
