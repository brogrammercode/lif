import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { AdminService } from './admin.service.js';
import {
  DRIVER_VERIFICATION_UPDATED_MESSAGE,
  RIDE_OFFER_CREATED_MESSAGE,
} from './admin.constant.js';
import {
  offer_schema,
  verification_schema,
  type OfferInput,
  type VerificationInput,
} from './dto/admin.dto.js';

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Patch('drivers/:id/verification')
  async verification(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Body(new ZodValidationPipe(verification_schema)) input: VerificationInput,
  ) {
    return success(
      await this.adminService.verify_driver(actorId, id, input),
      DRIVER_VERIFICATION_UPDATED_MESSAGE,
    );
  }

  @Post('rides/:id/offers')
  @HttpCode(201)
  async offer(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Body(new ZodValidationPipe(offer_schema)) input: OfferInput,
  ) {
    return success(
      await this.adminService.dispatch_ride_offer(actorId, id, input),
      RIDE_OFFER_CREATED_MESSAGE,
    );
  }
}
