import { Injectable } from '@nestjs/common';
import { SupportRepository } from './support.repo.js';
import { AppError } from '../../core/error.js';
import { TICKET_NOT_FOUND_MESSAGE } from './support.constant.js';
import type { MessageInput, TicketInput } from './support.type.js';
@Injectable()
export class SupportService {
  constructor(private readonly supportRepository: SupportRepository) {}
  readonly get_support_tickets = (user_id: string) =>
    this.supportRepository.list_tickets(user_id);

  readonly get_support_ticket = async (user_id: string, ticket_id: string) => {
    const ticket = await this.supportRepository.get_ticket(user_id, ticket_id);
    if (!ticket)
      throw new AppError(404, 'TICKET_NOT_FOUND', TICKET_NOT_FOUND_MESSAGE);
    return ticket;
  };

  readonly open_support_ticket = (user_id: string, input: TicketInput) =>
    this.supportRepository.create_ticket(user_id, input);

  readonly add_support_message = async (
    user_id: string,
    ticket_id: string,
    input: MessageInput,
  ) => {
    const message = await this.supportRepository.create_message(
      user_id,
      ticket_id,
      input,
    );
    if (!message)
      throw new AppError(404, 'TICKET_NOT_FOUND', TICKET_NOT_FOUND_MESSAGE);
    return message;
  };
}
