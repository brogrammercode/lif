import { Injectable } from '@nestjs/common';
import { AdminUserRepository } from './admin_user.repo.js';
import { CloudinaryService } from '../../infra/media/cloudinary.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../../core/error.js';
import { ADMIN_USER_MESSAGES } from './admin_user.constant.js';
import type { PersonalUpdateInput } from './admin_user.type.js';
@Injectable()
export class AdminUserService {
  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly cloudinaryService: CloudinaryService,
  ) {}
  readonly present = (
    user: NonNullable<
      Awaited<ReturnType<AdminUserRepository['find_admin_user']>>
    >,
  ) => ({
    ...user,
    last_known_latitude: user.last_known_latitude?.toNumber() ?? null,
    last_known_longitude: user.last_known_longitude?.toNumber() ?? null,
  });

  readonly get_personal_details = async (id: string) => {
    const user = await this.adminUserRepository.find_admin_user(id);
    if (!user)
      throw new AppError(404, 'USER_NOT_FOUND', ADMIN_USER_MESSAGES.NOT_FOUND);
    return this.present(user);
  };

  readonly save_personal_details = async (
    actor_id: string,
    id: string,
    input: PersonalUpdateInput,
  ) => {
    try {
      return await this.cloudinaryService.with_uploaded_image(
        input.image_upload,
        'users',
        async (url) =>
          this.present(
            await this.adminUserRepository.update_admin_user(actor_id, id, {
              ...input,
              avatar_url: url ?? input.avatar_url,
            }),
          ),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new AppError(
          409,
          'USER_PHONE_EXISTS',
          ADMIN_USER_MESSAGES.PHONE_EXISTS,
        );
      throw error;
    }
  };
}
