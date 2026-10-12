import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { AVATAR_UPDATED_MESSAGE, SAVED_PLACE_CREATED_MESSAGE, SAVED_PLACE_DELETED_MESSAGE, SAVED_PLACE_UPDATED_MESSAGE, PROFILE_UPDATED_MESSAGE, NOTIFICATION_READ_MESSAGE, USER_LOCATION_UPDATED_MESSAGE } from './user.constant.js';
import { avatar_schema, location_update_schema, profile_update_schema, saved_place_schema } from './user.type.js';
import { add_saved_place, edit_saved_place, get_notifications, get_saved_places, read_notification, remove_saved_place, save_user_last_known_location, update_user_profile } from './user.service.js';

const user_id = (request: Request): string => {
  if (!request.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  return request.auth.user_id;
};

export const update_me = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await update_user_profile(user_id(request), profile_update_schema.parse(request.body)), PROFILE_UPDATED_MESSAGE);
};

export const update_avatar = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await update_user_profile(user_id(request), avatar_schema.parse(request.body)), AVATAR_UPDATED_MESSAGE);
};

export const update_location = async (request: Request, response: Response): Promise<void> => {
  await save_user_last_known_location(
    user_id(request),
    location_update_schema.parse(request.body),
  );
  send_success(response, { updated: true }, USER_LOCATION_UPDATED_MESSAGE);
};

export const get_places = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await get_saved_places(user_id(request)), 'Saved places loaded');
};

export const post_place = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await add_saved_place(user_id(request), saved_place_schema.parse(request.body)), SAVED_PLACE_CREATED_MESSAGE, 201);
};

export const patch_place = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await edit_saved_place(user_id(request), request.params.id as string, saved_place_schema.parse(request.body)), SAVED_PLACE_UPDATED_MESSAGE);
};

export const delete_place = async (request: Request, response: Response): Promise<void> => {
  await remove_saved_place(user_id(request), request.params.id as string);
  send_success(response, null, SAVED_PLACE_DELETED_MESSAGE);
};

export const get_user_notifications = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await get_notifications(user_id(request)), 'Notifications loaded');
};

export const patch_notification = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await read_notification(user_id(request), request.params.id as string), NOTIFICATION_READ_MESSAGE);
};
