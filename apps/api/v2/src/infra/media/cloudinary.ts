import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  type ImageUpload,
} from './image_upload.js';
import { convert_image_to_webp } from './image_transform.js';
type UploadedImage = {
  url: string;
  public_id: string;
};
type ImageScope =
  | 'vehicle-categories'
  | 'users'
  | 'places'
  | 'vehicle-brands'
  | 'vehicle-models'
  | 'partner-documents';
@Injectable()
export class CloudinaryService {
  readonly UPLOAD_TIMEOUT_MS = 30000;

  readonly cloudinary_request = async (
    action: 'upload' | 'destroy',
    params: Record<string, string>,
    file?: string,
  ) => {
    if (
      !config.CLOUDINARY_CLOUD_NAME ||
      !config.CLOUDINARY_API_KEY ||
      !config.CLOUDINARY_API_SECRET
    )
      throw new AppError(
        503,
        'IMAGE_UPLOAD_NOT_CONFIGURED',
        'Image uploads are not configured. Contact your administrator.',
      );
    const signed = {
      ...params,
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };
    const payload = Object.entries(signed)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const signature = createHash('sha256')
      .update(payload + config.CLOUDINARY_API_SECRET)
      .digest('hex');
    const body = new URLSearchParams({
      ...signed,
      signature,
      api_key: config.CLOUDINARY_API_KEY,
      ...(file ? { file } : {}),
    });
    let response: Response;
    try {
      response = await fetch(
        `https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/image/${action}`,
        {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(this.UPLOAD_TIMEOUT_MS),
        },
      );
    } catch {
      throw new AppError(
        502,
        'IMAGE_UPLOAD_UNAVAILABLE',
        'The image service could not be reached. Your changes have not been saved. Please try again.',
      );
    }
    if (!response.ok) {
      if (action === 'upload' && response.status === 400)
        throw new AppError(
          422,
          'IMAGE_REJECTED',
          'The image could not be processed. Choose another JPEG, PNG, or WebP image and try again.',
        );
      throw new AppError(
        502,
        'IMAGE_UPLOAD_FAILED',
        'The image could not be saved. Your changes have not been saved. Please try again.',
      );
    }
    try {
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result))
        throw new Error('Invalid response');
      return result as Record<string, unknown>;
    } catch {
      throw new AppError(
        502,
        'IMAGE_UPLOAD_FAILED',
        'The image service returned an invalid response. Please try again.',
      );
    }
  };

  readonly discard_image = async (public_id: string) => {
    try {
      const result = await this.cloudinary_request('destroy', {
        public_id,
        invalidate: 'true',
      });
      if (result.result !== 'ok' && result.result !== 'not found')
        throw new Error('Image cleanup failed');
    } catch {
      console.error({ event: 'IMAGE_CLEANUP_FAILED', public_id });
    }
  };

  readonly upload_image = async (
    image: ImageUpload,
    scope: ImageScope,
  ): Promise<UploadedImage> => {
    const webp_data_url = await convert_image_to_webp(image);
    const public_id = `1more-admin/${scope}/${randomUUID()}`;
    let result: Record<string, unknown>;
    try {
      result = await this.cloudinary_request(
        'upload',
        { public_id, overwrite: 'false', allowed_formats: 'webp' },
        webp_data_url,
      );
    } catch (error) {
      if (
        error instanceof AppError &&
        ['IMAGE_UPLOAD_UNAVAILABLE', 'IMAGE_UPLOAD_FAILED'].includes(
          error.error_code,
        )
      )
        await this.discard_image(public_id);
      throw error;
    }
    if (
      result.public_id !== public_id ||
      result.format !== 'webp' ||
      typeof result.secure_url !== 'string' ||
      !result.secure_url.startsWith('https://') ||
      typeof result.width !== 'number' ||
      typeof result.height !== 'number' ||
      result.width <= 0 ||
      result.height <= 0 ||
      result.width * result.height > MAX_IMAGE_PIXELS ||
      typeof result.bytes !== 'number' ||
      result.bytes <= 0 ||
      result.bytes > MAX_IMAGE_BYTES
    ) {
      await this.discard_image(public_id);
      throw new AppError(
        502,
        'IMAGE_UPLOAD_FAILED',
        'The image service returned an invalid image. Please try again.',
      );
    }
    return { url: result.secure_url, public_id };
  };

  readonly with_uploaded_image = async <T>(
    image: ImageUpload | undefined,
    scope: ImageScope,
    persist: (url?: string) => Promise<T>,
  ): Promise<T> => {
    if (!image) return persist();
    const uploaded = await this.upload_image(image, scope);
    try {
      return await persist(uploaded.url);
    } catch (error) {
      await this.discard_image(uploaded.public_id);
      throw error;
    }
  };
}
