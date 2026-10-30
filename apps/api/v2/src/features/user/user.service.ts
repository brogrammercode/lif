import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repo.js';
import { CloudinaryService } from '../../infra/media/cloudinary.js';
import { AppError } from '../../core/error.js';
import {
  NOTIFICATION_NOT_FOUND_MESSAGE,
  SAVED_PLACE_NOT_FOUND_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
} from './user.constant.js';
import type {
  AvatarInput,
  LocationUpdateInput,
  ProfileUpdateInput,
  SavedPlaceInput,
} from './user.type.js';
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly cloudinaryService: CloudinaryService,
  ) {}
  readonly update_user_profile = (user_id: string, input: ProfileUpdateInput) =>
    this.userRepository.update_profile(user_id, input, user_id);

  readonly update_user_avatar = (user_id: string, input: AvatarInput) => {
    if ('avatar_url' in input) return this.update_user_profile(user_id, input);
    return this.cloudinaryService.with_uploaded_image(
      input.image_upload,
      'users',
      (url) => this.update_user_profile(user_id, { avatar_url: url }),
    );
  };

  readonly save_user_last_known_location = async (
    user_id: string,
    input: LocationUpdateInput,
  ) => {
    const user = await this.userRepository.update_last_known_location(
      user_id,
      input,
    );
    if (!user)
      throw new AppError(404, 'USER_NOT_FOUND', USER_NOT_FOUND_MESSAGE);
    return user;
  };

  readonly get_saved_places = (user_id: string) =>
    this.userRepository.list_saved_places(user_id);

  readonly add_saved_place = (user_id: string, input: SavedPlaceInput) =>
    this.userRepository.create_saved_place(user_id, input, user_id);

  readonly edit_saved_place = async (
    user_id: string,
    saved_place_id: string,
    input: SavedPlaceInput,
  ) => {
    const saved_place = await this.userRepository.update_saved_place(
      user_id,
      saved_place_id,
      input,
      user_id,
    );
    if (!saved_place)
      throw new AppError(
        404,
        'SAVED_PLACE_NOT_FOUND',
        SAVED_PLACE_NOT_FOUND_MESSAGE,
      );
    return saved_place;
  };

  readonly remove_saved_place = async (
    user_id: string,
    saved_place_id: string,
  ) => {
    const deleted = await this.userRepository.delete_saved_place(
      user_id,
      saved_place_id,
      user_id,
    );
    if (!deleted)
      throw new AppError(
        404,
        'SAVED_PLACE_NOT_FOUND',
        SAVED_PLACE_NOT_FOUND_MESSAGE,
      );
  };

  readonly get_notifications = (user_id: string) =>
    this.userRepository.list_notifications(user_id);

  readonly read_notification = async (
    user_id: string,
    notification_id: string,
  ) => {
    const notification = await this.userRepository.mark_notification_read(
      user_id,
      notification_id,
      user_id,
    );
    if (!notification)
      throw new AppError(
        404,
        'NOTIFICATION_NOT_FOUND',
        NOTIFICATION_NOT_FOUND_MESSAGE,
      );
    return notification;
  };
}
