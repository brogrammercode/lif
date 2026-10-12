import { AppError } from '../../core/error.js';
import { NOTIFICATION_NOT_FOUND_MESSAGE, SAVED_PLACE_NOT_FOUND_MESSAGE, USER_NOT_FOUND_MESSAGE } from './user.constant.js';
import { create_saved_place, delete_saved_place, list_notifications, list_saved_places, mark_notification_read, update_last_known_location, update_profile, update_saved_place } from './user.repo.js';
import type { LocationUpdateInput, ProfileUpdateInput, SavedPlaceInput } from './user.type.js';

export const update_user_profile = (user_id: string, input: ProfileUpdateInput) => update_profile(user_id, input, user_id);
export const save_user_last_known_location = async (user_id: string, input: LocationUpdateInput) => {
  const user = await update_last_known_location(user_id, input);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', USER_NOT_FOUND_MESSAGE);
  return user;
};
export const get_saved_places = (user_id: string) => list_saved_places(user_id);
export const add_saved_place = (user_id: string, input: SavedPlaceInput) => create_saved_place(user_id, input, user_id);

export const edit_saved_place = async (user_id: string, saved_place_id: string, input: SavedPlaceInput) => {
  const saved_place = await update_saved_place(user_id, saved_place_id, input, user_id);
  if (!saved_place) throw new AppError(404, 'SAVED_PLACE_NOT_FOUND', SAVED_PLACE_NOT_FOUND_MESSAGE);
  return saved_place;
};

export const remove_saved_place = async (user_id: string, saved_place_id: string) => {
  const deleted = await delete_saved_place(user_id, saved_place_id, user_id);
  if (!deleted) throw new AppError(404, 'SAVED_PLACE_NOT_FOUND', SAVED_PLACE_NOT_FOUND_MESSAGE);
};

export const get_notifications = (user_id: string) => list_notifications(user_id);

export const read_notification = async (user_id: string, notification_id: string) => {
  const notification = await mark_notification_read(user_id, notification_id, user_id);
  if (!notification) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', NOTIFICATION_NOT_FOUND_MESSAGE);
  return notification;
};
