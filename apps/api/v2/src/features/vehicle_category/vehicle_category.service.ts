import { Injectable } from '@nestjs/common';
import { VehicleCategoryRepository } from './vehicle_category.repo.js';
import { CloudinaryService } from '../../infra/media/cloudinary.js';
import { category_fare_values } from '../app_configuration/fare_calculation.js';
import type {
  CategoryInput,
  CategoryUpdateInput,
} from './vehicle_category.type.js';

function categoryResponse(
  category: Awaited<ReturnType<VehicleCategoryRepository['write_category']>>,
) {
  const effective = category.is_active && (category.parent?.is_active ?? true);
  return {
    ...category,
    base_fare: Number(category.base_fare),
    per_kilometer: Number(category.per_kilometer),
    per_minute: Number(category.per_minute),
    fare_policy: category_fare_values(category),
    parent_name: category.parent?.name ?? null,
    effective_active: effective,
    is_selectable: effective && category._count.children === 0,
  };
}
@Injectable()
export class VehicleCategoryService {
  constructor(
    private readonly vehicleCategoryRepository: VehicleCategoryRepository,
    private readonly cloudinaryService: CloudinaryService,
  ) {}
  readonly get_category_catalog = async (active_only = false) =>
    (await this.vehicleCategoryRepository.list_categories(active_only)).map(
      (item) => {
        const category = categoryResponse(item);
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
        categoryResponse(
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
        categoryResponse(
          await this.vehicleCategoryRepository.write_category(
            actor_id,
            { ...input, image_url: url ?? input.image_url },
            id,
          ),
        ),
    );
}
