import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import { SUPPORT_RIDE_NOT_FOUND_MESSAGE } from './support.constant.js';
import type { MessageInput, TicketInput } from './support.type.js';
@Injectable()
export class SupportRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly list_tickets = (user_id: string) =>
    this.prismaService.client.supportTicket.findMany({
      where: { user_id },
      orderBy: { created_at: 'desc' },
      include: { messages: { orderBy: { created_at: 'asc' } } },
    });

  readonly get_ticket = (user_id: string, ticket_id: string) =>
    this.prismaService.client.supportTicket.findFirst({
      where: { id: ticket_id, user_id },
      include: { messages: { orderBy: { created_at: 'asc' } } },
    });

  readonly create_ticket = async (user_id: string, input: TicketInput) =>
    this.prismaService.client.$transaction(async (tx) => {
      if (
        input.ride_id &&
        !(await tx.ride.findFirst({
          where: {
            id: input.ride_id,
            OR: [{ rider_id: user_id }, { driver: { user_id } }],
          },
          select: { id: true },
        }))
      )
        throw new AppError(
          404,
          'RIDE_NOT_FOUND',
          SUPPORT_RIDE_NOT_FOUND_MESSAGE,
        );
      const ticket = await tx.supportTicket.create({
        data: {
          user_id,
          ride_id: input.ride_id,
          subject: input.subject,
          priority: input.priority,
        },
      });
      const message = await tx.supportMessage.create({
        data: { ticket_id: ticket.id, author_id: user_id, body: input.body },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'SupportTicket',
        entity_id: ticket.id,
        action: 'CREATE_SUPPORT_TICKET',
        after_data: { ticket, message } as unknown as Prisma.InputJsonObject,
      });
      return tx.supportTicket.findUnique({
        where: { id: ticket.id },
        include: { messages: true },
      });
    });

  readonly create_message = async (
    user_id: string,
    ticket_id: string,
    input: MessageInput,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findFirst({
        where: { id: ticket_id, user_id },
      });
      if (!ticket) return null;
      const message = await tx.supportMessage.create({
        data: { ticket_id, author_id: user_id, body: input.body },
      });
      await tx.supportTicket.update({
        where: { id: ticket_id },
        data: { status: 'OPEN' },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'SupportMessage',
        entity_id: message.id,
        action: 'CREATE_SUPPORT_MESSAGE',
        after_data: message as unknown as Prisma.InputJsonObject,
      });
      return message;
    });
}
