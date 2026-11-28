import { Injectable } from '@nestjs/common';
import { AppError } from '../../core/error.js';
import { nextEntityId } from '../../database/entity-id.js';
import { PostgresService } from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import type { MessageInput, TicketInput } from './dto/support.dto.js';
import { SUPPORT_RIDE_NOT_FOUND_MESSAGE } from './support.constant.js';
import { supportSql } from './sql/support.sql.js';

interface Message {
  id: string;
  ticket_id: string;
  author_id: string | null;
  body: string;
  attachments: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface Ticket {
  id: string;
  user_id: string;
  ride_id: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'RESOLVED' | 'CLOSED';
  priority: TicketInput['priority'];
  subject: string;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

function mapTicket(row: Ticket & { messages: Message[] }) {
  return {
    ...row,
    messages: row.messages.map((message) => ({
      ...message,
      created_at: new Date(message.created_at),
      updated_at: new Date(message.updated_at),
    })),
  };
}

@Injectable()
export class SupportRepository {
  constructor(private readonly database: PostgresService) {}

  async list_tickets(user_id: string) {
    const { rows } = await this.database.query<
      Ticket & { messages: Message[] }
    >(supportSql.list, [user_id]);
    return rows.map(mapTicket);
  }

  async get_ticket(user_id: string, ticket_id: string) {
    const { rows } = await this.database.query<
      Ticket & { messages: Message[] }
    >(supportSql.detail, [user_id, ticket_id]);
    return rows[0] ? mapTicket(rows[0]) : null;
  }

  async create_ticket(user_id: string, input: TicketInput) {
    return this.database.transaction(async (tx) => {
      if (input.ride_id) {
        const { rows } = await tx.query<{ id: string }>(supportSql.ownedRide, [
          input.ride_id,
          user_id,
        ]);
        if (!rows[0])
          throw new AppError(
            404,
            'RIDE_NOT_FOUND',
            SUPPORT_RIDE_NOT_FOUND_MESSAGE,
          );
      }
      const { rows: tickets } = await tx.query<Ticket>(
        supportSql.createTicket,
        [nextEntityId(), user_id, input.ride_id, input.subject, input.priority],
      );
      const ticket = tickets[0]!;
      const { rows: messages } = await tx.query<Message>(
        supportSql.createMessage,
        [nextEntityId(), ticket.id, user_id, input.body],
      );
      await insertUserLog(tx, {
        actor_id: user_id,
        entity_type: 'SupportTicket',
        entity_id: ticket.id,
        action: 'CREATE_SUPPORT_TICKET',
        after_data: { ticket, message: messages[0]! },
      });
      return mapTicket({ ...ticket, messages });
    });
  }

  async create_message(
    user_id: string,
    ticket_id: string,
    input: MessageInput,
  ) {
    return this.database.transaction(async (tx) => {
      const updated = await tx.query<{ id: string }>(supportSql.reopenTicket, [
        ticket_id,
        user_id,
      ]);
      if (!updated.rows[0]) return null;
      const { rows } = await tx.query<Message>(supportSql.createMessage, [
        nextEntityId(),
        ticket_id,
        user_id,
        input.body,
      ]);
      const message = rows[0]!;
      await insertUserLog(tx, {
        actor_id: user_id,
        entity_type: 'SupportMessage',
        entity_id: message.id,
        action: 'CREATE_SUPPORT_MESSAGE',
        after_data: message,
      });
      return message;
    });
  }
}
