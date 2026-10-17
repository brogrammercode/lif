import sharp from 'sharp';
import { AppError } from '../../core/error.js';
import {
  image_upload_schema,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  type ImageUpload,
} from './image_upload.js';

export const convert_image_to_webp = async (
  image: ImageUpload,
): Promise<string> => {
  const validated = image_upload_schema.parse(image);
  const source = Buffer.from(
    validated.data_url.slice(validated.data_url.indexOf(',') + 1),
    'base64',
  );
  let converted: Buffer;
  try {
    // Convert in memory before any provider request. Keep transparency, image
    // dimensions, EXIF orientation, and animation frames within the pixel limit.
    converted = await sharp(source, {
      animated: true,
      autoOrient: true,
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'warning',
    })
      .webp({ quality: 85, alphaQuality: 100, effort: 4 })
      .timeout({ seconds: 10 })
      .toBuffer();
  } catch {
    throw new AppError(
      422,
      'IMAGE_CONVERSION_FAILED',
      'This image could not be converted to WebP. Choose a valid image up to 40 megapixels and try again.',
    );
  }
  if (!converted.length || converted.length > MAX_IMAGE_BYTES)
    throw new AppError(
      422,
      'IMAGE_CONVERTED_TOO_LARGE',
      'The converted image exceeds 5 MB. Choose a smaller image and try again.',
    );
  return `data:image/webp;base64,${converted.toString('base64')}`;
};
