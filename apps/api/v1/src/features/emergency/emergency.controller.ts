import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { EMERGENCY_CONTACT_CREATED_MESSAGE, EMERGENCY_CONTACT_DELETED_MESSAGE, EMERGENCY_CONTACTS_LOADED_MESSAGE, EMERGENCY_CONTACT_UPDATED_MESSAGE } from './emergency.constant.js';
import { emergency_contact_schema } from './emergency.type.js';
import { add_emergency_contact, edit_emergency_contact, get_emergency_contacts, remove_emergency_contact } from './emergency.service.js';

const current_user_id = (request: Request): string => {
  if (!request.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  return request.auth.user_id;
};

export const list = async (request: Request, response: Response): Promise<void> => { send_success(response, await get_emergency_contacts(current_user_id(request)), EMERGENCY_CONTACTS_LOADED_MESSAGE); };
export const create = async (request: Request, response: Response): Promise<void> => { send_success(response, await add_emergency_contact(current_user_id(request), emergency_contact_schema.parse(request.body)), EMERGENCY_CONTACT_CREATED_MESSAGE, 201); };
export const update = async (request: Request, response: Response): Promise<void> => { send_success(response, await edit_emergency_contact(current_user_id(request), request.params.id as string, emergency_contact_schema.parse(request.body)), EMERGENCY_CONTACT_UPDATED_MESSAGE); };
export const remove = async (request: Request, response: Response): Promise<void> => { await remove_emergency_contact(current_user_id(request), request.params.id as string); send_success(response, null, EMERGENCY_CONTACT_DELETED_MESSAGE); };
