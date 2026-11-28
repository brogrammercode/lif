import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import type { output as ZodOutput } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  Controller,
  Get,
  Post,
  Patch,
  Res,
  Param,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, AdminGuard, DriverAccessGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { reverse_schema } from '../geocode/dto/geocode.dto.js';
import { DriverOperationsService } from './driver_operations.service.js';
import {
  trip_collection_input,
  trip_message_input,
  trip_payment_input,
  trip_issue_input,
  trip_review_input,
  trip_reviews_query,
  trip_dispute_input,
} from './dto/driver-operations.dto.js';

@Controller()
@UseGuards(AuthGuard)
export class DriverOperationsController {
  constructor(private readonly service: DriverOperationsService) {}
  @Get('driver/operations')
  async dashboard(
    @CurrentUserId() actorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.dashboard(actorId),
      'Driver readiness loaded',
    );
  }
  @Get('trips/:id/context')
  async context(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.context(actorId, id),
      'Trip context loaded',
    );
  }
  @Post('trips/:id/start-code/refresh')
  async refresh_code(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.refresh_code(actorId, id),
      'Trip code refreshed',
    );
  }
  @Get('driver/rides/:id/navigation')
  @UseGuards(DriverAccessGuard)
  async navigation(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Query(new ZodValidationPipe(reverse_schema))
    query: ZodOutput<typeof reverse_schema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = query;
    return send_success(
      res,
      await this.service.navigation(
        actorId,
        id,
        input.latitude,
        input.longitude,
      ),
      'Navigation route loaded',
    );
  }
  @Get('trips/:id/rider-route')
  async rider_route(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.rider_route(actorId, id),
      'Ride progress route loaded',
    );
  }
  @Post('trips/:id/payment')
  async payment(
    @Body(new ZodValidationPipe(trip_payment_input))
    validatedInput: ZodOutput<typeof trip_payment_input>,
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validatedInput;
    return send_success(
      res,
      await this.service.payment(actorId, id, input.method),
      'Payment method selected',
    );
  }
  @Post('driver/rides/:id/collection')
  @UseGuards(DriverAccessGuard)
  async collection(
    @Body(new ZodValidationPipe(trip_collection_input))
    validatedInput: ZodOutput<typeof trip_collection_input>,
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validatedInput;
    return send_success(
      res,
      await this.service.payment(actorId, id, input.method, input),
      'Collection report saved',
    );
  }
  @Get('trips/:id/messages')
  async messages(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.messages(actorId, id),
      'Trip messages loaded',
    );
  }
  @Post('trips/:id/messages')
  async message(
    @Body(new ZodValidationPipe(trip_message_input))
    validatedInput: ZodOutput<typeof trip_message_input>,
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validatedInput;
    return send_success(
      res,
      await this.service.send_message(
        actorId,
        id,
        input.body,
        input.client_key,
      ),
      'Trip message sent',
    );
  }
  @Post('trips/:id/contact-attempt')
  async contact(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.contact_attempt(actorId, id),
      'Call attempt recorded',
    );
  }
  @Post('trips/:id/issues')
  async issue(
    @Body(new ZodValidationPipe(trip_issue_input))
    validatedInput: ZodOutput<typeof trip_issue_input>,
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validatedInput;
    return send_success(
      res,
      await this.service.report_issue(
        actorId,
        id,
        input.kind,
        input.reason,
        input.reason_code,
      ),
      'Trip issue submitted for review',
    );
  }
  @Post('trips/:id/dispute')
  async dispute(
    @Body(new ZodValidationPipe(trip_dispute_input))
    validatedInput: ZodOutput<typeof trip_dispute_input>,
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validatedInput;
    return send_success(
      res,
      await this.service.dispute(actorId, id, input.reason),
      'Dispute submitted',
    );
  }
  @Get('admin/trip-reviews')
  @UseGuards(AdminGuard)
  async reviews(
    @Query(new ZodValidationPipe(trip_reviews_query))
    query: ZodOutput<typeof trip_reviews_query>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.reviews(query.status, query.page),
      'Trip reviews loaded',
    );
  }
  @Patch('admin/trip-reviews/:id')
  @UseGuards(AdminGuard)
  async review(
    @CurrentUserId() actorId: string,
    @Body(new ZodValidationPipe(trip_review_input))
    input: ZodOutput<typeof trip_review_input>,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.review(actorId, id, input),
      'Trip review saved',
    );
  }
}
