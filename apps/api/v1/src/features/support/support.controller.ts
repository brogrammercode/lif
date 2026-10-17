import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { MESSAGE_CREATED_MESSAGE, TICKET_CREATED_MESSAGE, TICKET_LOADED_MESSAGE, TICKETS_LOADED_MESSAGE } from './support.constant.js';
import { message_schema, ticket_schema } from './support.type.js';
import { add_support_message, get_support_ticket, get_support_tickets, open_support_ticket } from './support.service.js';

const current_user_id = (request: Request): string => {
  if (!request.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  return request.auth.user_id;
};

export const list = async (request: Request, response: Response): Promise<void> => { send_success(response, await get_support_tickets(current_user_id(request)), TICKETS_LOADED_MESSAGE); };
export const detail = async (request: Request, response: Response): Promise<void> => { send_success(response, await get_support_ticket(current_user_id(request), request.params.id as string), TICKET_LOADED_MESSAGE); };
export const create = async (request: Request, response: Response): Promise<void> => { send_success(response, await open_support_ticket(current_user_id(request), ticket_schema.parse(request.body)), TICKET_CREATED_MESSAGE, 201); };
export const message = async (request: Request, response: Response): Promise<void> => { send_success(response, await add_support_message(current_user_id(request), request.params.id as string, message_schema.parse(request.body)), MESSAGE_CREATED_MESSAGE, 201); };
