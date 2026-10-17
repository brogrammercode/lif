import {
  category_response,
  list_categories,
  write_category,
} from './vehicle_category.repo.js';
import type {
  CategoryInput,
  CategoryUpdateInput,
} from './vehicle_category.type.js';
import { with_uploaded_image } from '../../infra/media/cloudinary.js';

export const get_category_catalog = async (active_only = false) =>
  (await list_categories(active_only)).map((item) => {
    const category = category_response(item);
    if (!active_only) return category;
    const { parent, _count, ...public_category } = category;
    return public_category;
  });

export const create_category = async (actor_id: string, input: CategoryInput) =>
  with_uploaded_image(input.image_upload, 'vehicle-categories', async (url) =>
    category_response(
      await write_category(actor_id, {
        ...input,
        image_url: url ?? input.image_url,
      }),
    ),
  );

export const update_category = async (
  actor_id: string,
  id: string,
  input: CategoryUpdateInput,
) =>
  with_uploaded_image(input.image_upload, 'vehicle-categories', async (url) =>
    category_response(
      await write_category(
        actor_id,
        { ...input, image_url: url ?? input.image_url },
        id,
      ),
    ),
  );
