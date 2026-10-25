import { RegistrationEmailController } from './registration_email.controller.js';
import { Controller, Get, Module, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { PendingService } from './pending.service.js';
import { pending_query } from './pending.rules.js';
@Controller('admin/pending-counts')
@UseGuards(AuthGuard, AdminGuard)
export class PendingController {
  constructor(private readonly service: PendingService) {}
  @Get() async counts(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Pending-Counts-Version', '1');
    res.setHeader('X-Pending-Counts-TTL', '30');
    return send_success(
      res,
      await this.service.counts(pending_query.parse(req.query)),
      'Pending counts retrieved',
    );
  }
}
@Module({
  controllers: [PendingController, RegistrationEmailController],
  providers: [PendingService],
})
export class PendingModule {}
