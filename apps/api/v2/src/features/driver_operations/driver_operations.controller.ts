import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthGuard, AdminGuard, DriverAccessGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { reverse_schema } from '../geocode/geocode.type.js';
import { DriverOperationsService } from './driver_operations.service.js';
import {
  trip_collection_input,
  trip_message_input,
  trip_payment_input,
  trip_issue_input,
  trip_review_input,
  trip_dispute_input,
} from './driver_operations.type.js';

@Controller()
@UseGuards(AuthGuard)
export class DriverOperationsController {
  constructor(private readonly service: DriverOperationsService) {}
  @Get('driver/operations')
  async dashboard(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.dashboard(req.auth!.user_id),
      'Driver readiness loaded',
    );
  }
  @Get('trips/:id/context')
  async context(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.context(req.auth!.user_id, id),
      'Trip context loaded',
    );
  }
  @Post('trips/:id/start-code/refresh')
  async refresh_code(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.refresh_code(req.auth!.user_id, id),
      'Trip code refreshed',
    );
  }
  @Get('driver/rides/:id/navigation')
  @UseGuards(DriverAccessGuard)
  async navigation(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = reverse_schema.parse(query);
    return send_success(
      res,
      await this.service.navigation(
        req.auth!.user_id,
        id,
        input.latitude,
        input.longitude,
      ),
      'Navigation route loaded',
    );
  }
  @Get('trips/:id/rider-route')
  async rider_route(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.rider_route(req.auth!.user_id, id),
      'Ride progress route loaded',
    );
  }
  @Post('trips/:id/payment')
  async payment(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = trip_payment_input.parse(req.body);
    return send_success(
      res,
      await this.service.payment(req.auth!.user_id, id, input.method),
      'Payment method selected',
    );
  }
  @Post('driver/rides/:id/collection')
  @UseGuards(DriverAccessGuard)
  async collection(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = trip_collection_input.parse(req.body);
    return send_success(
      res,
      await this.service.payment(req.auth!.user_id, id, input.method, input),
      'Collection report saved',
    );
  }
  @Get('trips/:id/messages')
  async messages(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.messages(req.auth!.user_id, id),
      'Trip messages loaded',
    );
  }
  @Post('trips/:id/messages')
  async message(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = trip_message_input.parse(req.body);
    return send_success(
      res,
      await this.service.send_message(
        req.auth!.user_id,
        id,
        input.body,
        input.client_key,
      ),
      'Trip message sent',
    );
  }
  @Post('trips/:id/contact-attempt')
  async contact(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.contact_attempt(req.auth!.user_id, id),
      'Call attempt recorded',
    );
  }
  @Post('trips/:id/issues')
  async issue(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = trip_issue_input.parse(req.body);
    return send_success(
      res,
      await this.service.report_issue(
        req.auth!.user_id,
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
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = trip_dispute_input.parse(req.body);
    return send_success(
      res,
      await this.service.dispute(req.auth!.user_id, id, input.reason),
      'Dispute submitted',
    );
  }
  @Get('admin/trip-reviews')
  @UseGuards(AdminGuard)
  async reviews(
    @Query('status') status: unknown,
    @Query('page') page: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filter = z
      .enum([
        'PENDING',
        'REQUESTED',
        'DISPUTED',
        'APPROVED',
        'WAIVED',
        'REJECTED',
        'SETTLED',
      ])
      .optional()
      .parse(status);
    return send_success(
      res,
      await this.service.reviews(
        filter,
        z.coerce.number().int().min(1).max(1000000).default(1).parse(page),
      ),
      'Trip reviews loaded',
    );
  }
  @Patch('admin/trip-reviews/:id')
  @UseGuards(AdminGuard)
  async review(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.review(
        req.auth!.user_id,
        id,
        trip_review_input.parse(req.body),
      ),
      'Trip review saved',
    );
  }
}
