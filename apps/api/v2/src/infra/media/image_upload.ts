import { z } from 'zod';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40000000;
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;
const DATA_URL_PATTERN =
  /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
export const image_upload_schema = z
  .object({
    file_name: z.string().trim().min(1).max(255),
    data_url: z.string().max(MAX_DATA_URL_LENGTH),
  })
  .strict()
  .superRefine((input, context) => {
    const match = DATA_URL_PATTERN.exec(input.data_url);
    if (!match?.[2]) {
      context.addIssue({
        code: 'custom',
        path: ['data_url'],
        message: 'Choose a JPEG, PNG, or WebP image.',
      });
      return;
    }
    const bytes = Buffer.from(match[2], 'base64');
    const valid =
      bytes.length > 0 &&
      bytes.length <= MAX_IMAGE_BYTES &&
      bytes.toString('base64') === match[2] &&
      ((match[1] === 'jpeg' &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff) ||
        (match[1] === 'png' &&
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (match[1] === 'webp' &&
          bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP'));
    if (!valid)
      context.addIssue({
        code: 'custom',
        path: ['data_url'],
        message: 'Choose a valid JPEG, PNG, or WebP image up to 5 MB.',
      });
  });
export type ImageUpload = z.infer<typeof image_upload_schema>;
