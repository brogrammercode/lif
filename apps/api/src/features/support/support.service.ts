import { AppError } from '../../core/error.js';
import { TICKET_NOT_FOUND_MESSAGE } from './support.constant.js';
import { create_message, create_ticket, get_ticket, list_tickets } from './support.repo.js';
import type { MessageInput, TicketInput } from './support.type.js';

export const get_support_tickets = (user_id: string) => list_tickets(user_id);
export const get_support_ticket = async (user_id: string, ticket_id: string) => {
  const ticket = await get_ticket(user_id, ticket_id);
  if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', TICKET_NOT_FOUND_MESSAGE);
  return ticket;
};
export const open_support_ticket = (user_id: string, input: TicketInput) => create_ticket(user_id, input);
export const add_support_message = async (user_id: string, ticket_id: string, input: MessageInput) => {
  const message = await create_message(user_id, ticket_id, input);
  if (!message) throw new AppError(404, 'TICKET_NOT_FOUND', TICKET_NOT_FOUND_MESSAGE);
  return message;
};
