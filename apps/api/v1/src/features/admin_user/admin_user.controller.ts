import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { ADMIN_USER_MESSAGES } from './admin_user.constant.js';
import { list_admin_users } from './admin_user.repo.js';
import {
  get_personal_details,
  save_personal_details,
} from './admin_user.service.js';
import {
  personal_update_schema,
  user_id_schema,
  user_list_schema,
} from './admin_user.type.js';

export const list = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await list_admin_users(user_list_schema.parse(request.query)),
    'Users retrieved',
  );
};
export const detail = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await get_personal_details(user_id_schema.parse(request.params.id)),
    'Personal details retrieved',
  );
};
export const update = async (
  request: Request,
  response: Response,
): Promise<void> => {
  if (!request.auth)
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  send_success(
    response,
    await save_personal_details(
      request.auth.user_id,
      user_id_schema.parse(request.params.id),
      personal_update_schema.parse(request.body),
    ),
    ADMIN_USER_MESSAGES.UPDATED,
  );
};
