import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, AdminGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { schedule_new_user_emails } from '../../infra/mail/new_user_email.js';
import { PostgresService } from '../../database/postgres.service.js';
import { AdminUserRepository } from './admin_user.repo.js';
import { AdminUserService } from './admin_user.service.js';
import { ADMIN_USER_MESSAGES } from './admin_user.constant.js';
import { rides_query } from './admin_user.rides.js';
import {
  personal_update_schema,
  user_id_schema,
  user_list_schema,
} from './admin_user.type.js';

const deactivateInput = z
  .object({
    expected_updated_at: z.iso.datetime(),
    confirmation: z.string().trim().min(1).max(254),
  })
  .strict();

@Controller('admin/users')
@UseGuards(AuthGuard, AdminGuard)
export class AdminUserController {
  constructor(
    private readonly users: AdminUserRepository,
    private readonly service: AdminUserService,
    private readonly db: PostgresService,
  ) {}

  @Get(':id/rides')
  @Header('Cache-Control', 'no-store')
  async rides(
    @Param('id', new ZodValidationPipe(user_id_schema)) id: string,
    @Query(new ZodValidationPipe(rides_query))
    input: z.output<typeof rides_query>,
  ) {
    return success(await this.users.rides(id, input), 'User rides retrieved');
  }

  @Delete(':id')
  async deactivate(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(user_id_schema)) id: string,
    @Body(new ZodValidationPipe(deactivateInput))
    input: z.output<typeof deactivateInput>,
  ) {
    return success(
      await this.users.deactivate_user(actor, id, input),
      'User deactivated; history retained',
    );
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(user_list_schema))
    input: z.output<typeof user_list_schema>,
  ) {
    schedule_new_user_emails(this.db);
    return success(await this.users.list_admin_users(input), 'Users retrieved');
  }

  @Get(':id')
  async detail(@Param('id', new ZodValidationPipe(user_id_schema)) id: string) {
    return success(
      await this.service.get_personal_details(id),
      'Personal details retrieved',
    );
  }

  @Patch(':id')
  async update(
    @CurrentUserId() actor: string,
    @Param('id', new ZodValidationPipe(user_id_schema)) id: string,
    @Body(new ZodValidationPipe(personal_update_schema))
    input: z.output<typeof personal_update_schema>,
  ) {
    return success(
      await this.service.save_personal_details(actor, id, input),
      ADMIN_USER_MESSAGES.UPDATED,
    );
  }
}
