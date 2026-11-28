import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import {
  registrationEmailId,
  registrationEmailQuery,
  type RegistrationEmailQuery,
} from './dto/registration-email.dto.js';
import { RegistrationEmailService } from './registration-email.service.js';

@Controller('admin/registration-emails')
@UseGuards(AuthGuard, AdminGuard)
export class RegistrationEmailController {
  constructor(private readonly service: RegistrationEmailService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Query(new ZodValidationPipe(registrationEmailQuery))
    input: RegistrationEmailQuery,
  ) {
    return success(
      await this.service.list(input),
      'Registration email deliveries loaded',
    );
  }

  @Post(':id/retry')
  @HttpCode(200)
  async retry(
    @CurrentUserId() actorId: string,
    @Param('id', new ZodValidationPipe(registrationEmailId)) id: string,
  ) {
    return success(
      await this.service.retry(actorId, id),
      'Registration email queued for retry',
    );
  }
}
