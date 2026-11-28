import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { success } from '../../core/response.js';
import { AdminAccessService } from './admin_access.service.js';
import {
  ADMIN_ACCESS_MESSAGES,
  ADMIN_ACCESS_ROUTE,
} from './admin_access.constant.js';
import {
  access_list_schema,
  access_user_id_schema,
  grant_access_schema,
  revoke_access_schema,
  type AccessListInput,
  type GrantAccessInput,
  type RevokeAccessInput,
} from './admin_access.type.js';

@Controller(ADMIN_ACCESS_ROUTE)
@UseGuards(AuthGuard, AdminGuard)
export class AdminAccessController {
  constructor(private readonly service: AdminAccessService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(access_list_schema)) input: AccessListInput,
  ) {
    return success(
      await this.service.list_access(input),
      ADMIN_ACCESS_MESSAGES.LOADED,
    );
  }

  @Post()
  @HttpCode(200)
  async grant(
    @CurrentUserId() actor: string,
    @Body(new ZodValidationPipe(grant_access_schema)) input: GrantAccessInput,
  ) {
    return success(
      await this.service.grant_access(actor, input),
      ADMIN_ACCESS_MESSAGES.GRANTED,
    );
  }

  @Delete(':id')
  async revoke(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(access_user_id_schema)) id: string,
    @Body(new ZodValidationPipe(revoke_access_schema)) input: RevokeAccessInput,
  ) {
    return success(
      await this.service.revoke_access(actor, id, input),
      ADMIN_ACCESS_MESSAGES.REVOKED,
    );
  }
}
