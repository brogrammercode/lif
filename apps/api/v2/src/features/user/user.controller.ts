import {
  Controller,
  HttpCode,
  Req,
  Res,
  Patch,
  Post,
  Get,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service.js';
import { AuthGuard } from '../../core/guards.js';
import { USER_ROUTES } from './user.route.js';
import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
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
} from './user.type.js';
@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}
  readonly user_id = (request: Request): string => {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
    return request.auth.user_id;
  };

  @Patch(USER_ROUTES.UPDATE_ME)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async update_me(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.userService.update_user_profile(
        this.user_id(request),
        profile_update_schema.parse(request.body),
      ),
      PROFILE_UPDATED_MESSAGE,
    );
  }

  @Post(USER_ROUTES.UPDATE_AVATAR)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async update_avatar(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.userService.update_user_avatar(
        this.user_id(request),
        avatar_schema.parse(request.body),
      ),
      AVATAR_UPDATED_MESSAGE,
    );
  }

  @Patch(USER_ROUTES.UPDATE_LOCATION)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async update_location(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.userService.save_user_last_known_location(
      this.user_id(request),
      location_update_schema.parse(request.body),
    );
    return send_success(
      response,
      { updated: true },
      USER_LOCATION_UPDATED_MESSAGE,
    );
  }

  @Get(USER_ROUTES.GET_PLACES)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async get_places(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.userService.get_saved_places(this.user_id(request)),
      'Saved places loaded',
    );
  }

  @Post(USER_ROUTES.POST_PLACE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async post_place(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.userService.add_saved_place(
        this.user_id(request),
        saved_place_schema.parse(request.body),
      ),
      SAVED_PLACE_CREATED_MESSAGE,
      201,
    );
  }

  @Patch(USER_ROUTES.PATCH_PLACE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async patch_place(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.userService.edit_saved_place(
        this.user_id(request),
        request.params.id as string,
        saved_place_schema.parse(request.body),
      ),
      SAVED_PLACE_UPDATED_MESSAGE,
    );
  }

  @Delete(USER_ROUTES.DELETE_PLACE)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async delete_place(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.userService.remove_saved_place(
      this.user_id(request),
      request.params.id as string,
    );
    return send_success(response, null, SAVED_PLACE_DELETED_MESSAGE);
  }

  @Get(USER_ROUTES.GET_USER_NOTIFICATIONS)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async get_user_notifications(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.userService.get_notifications(this.user_id(request)),
      'Notifications loaded',
    );
  }

  @Post(USER_ROUTES.PATCH_NOTIFICATION)
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async patch_notification(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return send_success(
      response,
      await this.userService.read_notification(
        this.user_id(request),
        request.params.id as string,
      ),
      NOTIFICATION_READ_MESSAGE,
    );
  }
}
