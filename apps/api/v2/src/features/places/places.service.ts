import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppError } from '../../core/error.js';
import { CloudinaryService } from '../../infra/media/cloudinary.js';
import { PlacesRepository } from './places.repo.js';
import type { z } from 'zod';
import type { place_photo, PlaceInput, PlaceList } from './places.type.js';
@Injectable()
export class PlacesService {
  constructor(
    private readonly repository: PlacesRepository,
    private readonly images: CloudinaryService,
  ) {}
  list(user_id: string, input: PlaceList) {
    return this.repository.list(user_id, input);
  }
  detail(user_id: string, id: string) {
    return this.repository.detail(user_id, id);
  }
  reviews(id: string, page: number) {
    return this.repository.reviews(id, page);
  }
  create(user_id: string, input: PlaceInput) {
    return this.repository.create(user_id, input);
  }
  update(user_id: string, id: string, input: PlaceInput & { version: number }) {
    return this.repository.update(user_id, id, input);
  }
  bookmark(user_id: string, id: string, value: boolean) {
    return this.repository.bookmark(user_id, id, value);
  }
  visit(user_id: string, id: string, value: boolean) {
    return this.repository.visit(user_id, id, value);
  }
  review(
    user_id: string,
    id: string,
    input: { score: number; comment: string } | null,
  ) {
    return this.repository.review(user_id, id, input);
  }
  async remove_photo(user_id: string, id: string, photo_id: string) {
    const public_id = await this.repository.remove_photo(user_id, id, photo_id);
    await this.images.discard_image(public_id);
    return { removed: true };
  }
  async photo(user_id: string, id: string, input: z.infer<typeof place_photo>) {
    const content_hash = createHash('sha256')
      .update(input.image_upload.data_url)
      .digest('hex');
    const existing = await this.repository.photo_by_key(
      user_id,
      input.request_key,
    );
    if (existing) {
      if (existing.place_id !== id || existing.content_hash !== content_hash)
        throw new AppError(
          409,
          'PHOTO_REQUEST_CONFLICT',
          'This photo request has changed. Choose the photo again.',
        );
      return { id: existing.id, url: existing.url };
    }
    if ((await this.repository.photo_capacity(id)) >= 10)
      throw new AppError(
        422,
        'PLACE_PHOTO_LIMIT',
        'A place can have up to 10 photos.',
      );
    const uploaded = await this.images.upload_image(
      input.image_upload,
      'places',
    );
    try {
      const result = await this.repository.photo(user_id, id, {
        ...uploaded,
        content_hash,
        request_key: input.request_key,
      });
      if (result.reused) await this.images.discard_image(uploaded.public_id);
      return { id: result.photo.id, url: result.photo.url };
    } catch (error) {
      // A domain rejection proves no attachment was committed. For an ambiguous
      // database failure retain the object rather than deleting a committed image.
      if (error instanceof AppError)
        await this.images.discard_image(uploaded.public_id);
      else
        console.error({
          event: 'PLACE_PHOTO_PERSIST_UNCERTAIN',
          public_id: uploaded.public_id,
        });
      throw error;
    }
  }
}
