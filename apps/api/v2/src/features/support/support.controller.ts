import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard } from '../../core/guards.js';
import { IdempotencyInterceptor } from '../../core/idempotency.interceptor.js';
import { success } from '../../core/response.js';
import { SupportService } from './support.service.js';
import {
  MESSAGE_CREATED_MESSAGE,
  TICKET_CREATED_MESSAGE,
  TICKET_LOADED_MESSAGE,
  TICKETS_LOADED_MESSAGE,
} from './support.constant.js';
import {
  message_schema,
  ticket_schema,
  type MessageInput,
  type TicketInput,
} from './dto/support.dto.js';

@Controller('support/tickets')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  async list(@CurrentUserId() userId: string) {
    return success(
      await this.supportService.get_support_tickets(userId),
      TICKETS_LOADED_MESSAGE,
    );
  }

  @Get(':id')
  async detail(
    @CurrentUserId() userId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    return success(
      await this.supportService.get_support_ticket(userId, id),
      TICKET_LOADED_MESSAGE,
    );
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(ticket_schema)) input: TicketInput,
  ) {
    return success(
      await this.supportService.open_support_ticket(userId, input),
      TICKET_CREATED_MESSAGE,
    );
  }

  @Post(':id/messages')
  @HttpCode(201)
  async message(
    @CurrentUserId() userId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Body(new ZodValidationPipe(message_schema)) input: MessageInput,
  ) {
    return success(
      await this.supportService.add_support_message(userId, id, input),
      MESSAGE_CREATED_MESSAGE,
    );
  }
}
