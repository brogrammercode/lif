import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { convert_image_to_webp } from '../infra/media/image_transform.js';
import { CloudinaryService } from '../infra/media/cloudinary.js';
import { AppError } from '../core/error.js';
import { config } from '../core/config.js';
import {
  MAX_IMAGE_BYTES,
  type ImageUpload,
} from '../infra/media/image_upload.js';

const service = new CloudinaryService();
const input = async (
  format: 'png' | 'jpeg' | 'webp' = 'png',
): Promise<ImageUpload> => {
  const bytes = await sharp({
    create: {
      width: 12,
      height: 24,
      channels: 4,
      background: { r: 20, g: 100, b: 200, alpha: 0.4 },
    },
  })
    .toFormat(format)
    .toBuffer();
  return {
    file_name: `fixture.${format}`,
    data_url: `data:image/${format};base64,${bytes.toString('base64')}`,
  };
};
const buffer = (data: string) =>
  Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
const code = (expected: string) => (error: unknown) =>
  error instanceof AppError && error.error_code === expected;
afterEach(() => mock.restoreAll());

it('preserves animation frames, timing and loop count when re-encoding WebP', async () => {
  const frames = Buffer.concat([
    Buffer.alloc(16, Buffer.from([255, 0, 0, 255])),
    Buffer.alloc(16, Buffer.from([0, 0, 255, 255])),
  ]);
  const source = await sharp(frames, {
    raw: { width: 2, height: 4, channels: 4, pageHeight: 2 },
  })
    .webp({ lossless: true, delay: [70, 90], loop: 2 })
    .toBuffer();
  const result = await convert_image_to_webp({
    file_name: 'animated.webp',
    data_url: `data:image/webp;base64,${source.toString('base64')}`,
  });
  const metadata = await sharp(buffer(result), { animated: true }).metadata();
  assert.equal(metadata.pages, 2);
  assert.deepEqual(metadata.delay, [70, 90]);
  assert.equal(metadata.loop, 2);
});

it('converts JPEG, PNG, and WebP inputs to actual WebP bytes', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const result = await convert_image_to_webp(await input(format));
    assert.ok(result.startsWith('data:image/webp;base64,'));
    const metadata = await sharp(buffer(result)).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 12);
    assert.equal(metadata.height, 24);
    if (format !== 'jpeg') assert.equal(metadata.hasAlpha, true);
  }
});

it('honors EXIF orientation before removing metadata', async () => {
  const bytes = await sharp({
    create: { width: 12, height: 24, channels: 3, background: 'red' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const result = await convert_image_to_webp({
    file_name: 'oriented.jpg',
    data_url: `data:image/jpeg;base64,${bytes.toString('base64')}`,
  });
  const metadata = await sharp(buffer(result)).metadata();
  assert.equal(metadata.width, 24);
  assert.equal(metadata.height, 12);
  assert.equal(metadata.orientation, undefined);
});

it('rejects malformed or oversized files before contacting the provider', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected network call');
  });
  const damaged = {
    file_name: 'bad.jpg',
    data_url: `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 0, 0]).toString('base64')}`,
  };
  await assert.rejects(
    service.with_uploaded_image(damaged, 'users', async () => null),
    code('IMAGE_CONVERSION_FAILED'),
  );
  const oversized = {
    file_name: 'large.png',
    data_url: `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')}`,
  };
  await assert.rejects(
    service.with_uploaded_image(oversized, 'users', async () => null),
  );
  assert.equal(fetch.mock.callCount(), 0);
});

it('uploads only WebP and supplies its URL to the entity save after upload completes', async () => {
  const events: string[] = [];
  mock.method(
    globalThis,
    'fetch',
    async (_url: string | URL | Request, options?: RequestInit) => {
      events.push('upload');
      const fields = new URLSearchParams(String(options?.body));
      const file = fields.get('file')!;
      assert.ok(file.startsWith('data:image/webp;base64,'));
      assert.equal((await sharp(buffer(file)).metadata()).format, 'webp');
      assert.equal(fields.get('allowed_formats'), 'webp');
      const signed = ['allowed_formats', 'overwrite', 'public_id', 'timestamp']
        .map((key) => `${key}=${fields.get(key)}`)
        .join('&');
      assert.equal(
        fields.get('signature'),
        createHash('sha256')
          .update(signed + config.CLOUDINARY_API_SECRET)
          .digest('hex'),
      );
      return Response.json({
        public_id: fields.get('public_id'),
        format: 'webp',
        secure_url: 'https://example.test/fixture.webp',
        width: 12,
        height: 24,
        bytes: buffer(file).length,
      });
    },
  );
  const saved = await service.with_uploaded_image(
    await input(),
    'vehicle-categories',
    async (url) => {
      events.push('persist');
      return url;
    },
  );
  assert.equal(saved, 'https://example.test/fixture.webp');
  assert.deepEqual(events, ['upload', 'persist']);
});

it('cleans up a new image when saving the entity fails', async () => {
  const operations: string[] = [];
  let uploadedId: string | null = null;
  mock.method(
    globalThis,
    'fetch',
    async (url: string | URL | Request, options?: RequestInit) => {
      const fields = new URLSearchParams(String(options?.body));
      const action = String(url).split('/').at(-1)!;
      operations.push(action);
      if (action === 'destroy') {
        assert.equal(fields.get('public_id'), uploadedId);
        return Response.json({ result: 'ok' });
      }
      uploadedId = fields.get('public_id');
      return Response.json({
        public_id: uploadedId,
        format: 'webp',
        secure_url: 'https://example.test/fixture.webp',
        width: 12,
        height: 24,
        bytes: 100,
      });
    },
  );
  const failure = new Error('Fixture database failure');
  await assert.rejects(
    service.with_uploaded_image(await input(), 'users', async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.deepEqual(operations, ['upload', 'destroy']);
});

it('does not upload when the image is unchanged or removed', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected upload');
  });
  assert.equal(
    await service.with_uploaded_image(
      undefined,
      'users',
      async (url) => url ?? null,
    ),
    null,
  );
  assert.equal(fetch.mock.callCount(), 0);
});
