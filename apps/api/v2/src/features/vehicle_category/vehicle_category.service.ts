import { Injectable } from '@nestjs/common';
import { VehicleCategoryRepository } from './vehicle_category.repo.js';
import { CloudinaryService } from '../../infra/media/cloudinary.js';
import type {
  CategoryInput,
  CategoryUpdateInput,
} from './vehicle_category.type.js';
@Injectable()
export class VehicleCategoryService {
  constructor(
    private readonly vehicleCategoryRepository: VehicleCategoryRepository,
    private readonly cloudinaryService: CloudinaryService,
  ) {}
  readonly get_category_catalog = async (active_only = false) =>
    (await this.vehicleCategoryRepository.list_categories(active_only)).map(
      (item) => {
        const category = this.vehicleCategoryRepository.category_response(item);
        if (!active_only) return category;
        const { parent, _count, ...public_category } = category;
        return public_category;
      },
    );

  readonly create_category = async (actor_id: string, input: CategoryInput) =>
    this.cloudinaryService.with_uploaded_image(
      input.image_upload,
      'vehicle-categories',
      async (url) =>
        this.vehicleCategoryRepository.category_response(
          await this.vehicleCategoryRepository.write_category(actor_id, {
            ...input,
            image_url: url ?? input.image_url,
          }),
        ),
    );

  readonly update_category = async (
    actor_id: string,
    id: string,
    input: CategoryUpdateInput,
  ) =>
    this.cloudinaryService.with_uploaded_image(
      input.image_upload,
      'vehicle-categories',
      async (url) =>
        this.vehicleCategoryRepository.category_response(
          await this.vehicleCategoryRepository.write_category(
            actor_id,
            { ...input, image_url: url ?? input.image_url },
            id,
          ),
        ),
    );
}
