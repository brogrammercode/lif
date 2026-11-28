import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { UserService } from './user.service.js';
import {
  AVATAR_UPDATED_MESSAGE,
  SAVED_PLACE_CREATED_MESSAGE,
  SAVED_PLACE_DELETED_MESSAGE,
  SAVED_PLACE_UPDATED_MESSAGE,
  PROFILE_UPDATED_MESSAGE,
  NOTIFICATION_READ_MESSAGE,
  USER_LOCATION_UPDATED_MESSAGE,
} from './user.constant.js';
import {
  avatar_schema,
  location_update_schema,
  profile_update_schema,
  saved_place_schema,
  type AvatarInput,
  type LocationUpdateInput,
  type ProfileUpdateInput,
  type SavedPlaceInput,
} from './dto/user.dto.js';

@Controller('me')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch()
  async update_me(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(profile_update_schema))
    input: ProfileUpdateInput,
  ) {
    return success(
      await this.userService.update_user_profile(userId, input),
      PROFILE_UPDATED_MESSAGE,
    );
  }

  @Post('avatar')
  @HttpCode(200)
  async update_avatar(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(avatar_schema)) input: AvatarInput,
  ) {
    return success(
      await this.userService.update_user_avatar(userId, input),
      AVATAR_UPDATED_MESSAGE,
    );
  }

  @Patch('location')
  async update_location(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(location_update_schema))
    input: LocationUpdateInput,
  ) {
    await this.userService.save_user_last_known_location(userId, input);
    return success({ updated: true }, USER_LOCATION_UPDATED_MESSAGE);
  }

  @Get('saved-places')
  async get_places(@CurrentUserId() userId: string) {
    return success(
      await this.userService.get_saved_places(userId),
      'Saved places loaded',
    );
  }

  @Post('saved-places')
  @HttpCode(201)
  async post_place(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(saved_place_schema)) input: SavedPlaceInput,
  ) {
    return success(
      await this.userService.add_saved_place(userId, input),
      SAVED_PLACE_CREATED_MESSAGE,
    );
  }

  @Patch('saved-places/:id')
  async patch_place(
    @CurrentUserId() userId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Body(new ZodValidationPipe(saved_place_schema)) input: SavedPlaceInput,
  ) {
    return success(
      await this.userService.edit_saved_place(userId, id, input),
      SAVED_PLACE_UPDATED_MESSAGE,
    );
  }

  @Delete('saved-places/:id')
  async delete_place(
    @CurrentUserId() userId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    await this.userService.remove_saved_place(userId, id);
    return success(null, SAVED_PLACE_DELETED_MESSAGE);
  }

  @Get('notifications')
  async get_user_notifications(@CurrentUserId() userId: string) {
    return success(
      await this.userService.get_notifications(userId),
      'Notifications loaded',
    );
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  async patch_notification(
    @CurrentUserId() userId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    return success(
      await this.userService.read_notification(userId, id),
      NOTIFICATION_READ_MESSAGE,
    );
  }
}
