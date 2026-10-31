import assert from 'node:assert/strict';
import { it } from 'node:test';
import { PrismaService } from '../infra/database/prisma.service.js';
import { CloudinaryService } from '../infra/media/cloudinary.js';
import { PlacesRepository } from '../features/places/places.repo.js';
import { PlacesService } from '../features/places/places.service.js';
import {
  place_input,
  place_dedupe_key,
  place_list,
  place_review,
} from '../features/places/places.type.js';

const input = place_input.parse({
  name: 'River Cafe',
  address: 'Bhagalpur',
  latitude: 25.23,
  longitude: 86.95,
});
function fixture() {
  const calls: [string, any][] = [];
  const record = (name: string, value: unknown) => {
    calls.push([name, value]);
  };
  const tx: any = {
    $executeRaw: async () => {},
    user: {
      findUnique: async () => ({
        status: 'ACTIVE',
        deleted_at: null,
        role: 'RIDER',
      }),
    },
    userLog: { create: async (a: any) => record('audit', a) },
    communityPlace: {
      findUnique: async () => ({ id: 'place' }),
      findUniqueOrThrow: async () => ({ ...input, id: 'place' }),
      upsert: async (a: any) => {
        record('place', a);
        return { ...input, id: 'place' };
      },
      updateMany: async (a: any) => {
        record('update', a);
        return { count: 1 };
      },
    },
    savedPlace: {
      upsert: async (a: any) => record('save', a),
      deleteMany: async (a: any) => record('unsave', a),
      updateMany: async () => {},
    },
    placeVisit: {
      upsert: async (a: any) => record('visit', a),
      deleteMany: async (a: any) => record('unvisit', a),
    },
    placeReview: {
      upsert: async (a: any) => {
        record('review', a);
        return { id: 'review' };
      },
      deleteMany: async (a: any) => record('unreview', a),
    },
    placePhoto: {
      findUnique: async () => null,
      count: async () => 0,
      create: async (a: any) => ({ id: 'photo', ...a.data }),
      findFirst: async () => null,
    },
  };
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: { ...tx, $transaction: async (run: any) => run(tx) },
  });
  return { repo: new PlacesRepository(db), calls, tx, db };
}
it('shared place input validates coordinates, public URLs and bounded filters without accepting an actor override', () => {
  for (const invalid of [
    { ...input, created_by_id: 'other' },
    { ...input, latitude: 91 },
    { ...input, website: 'javascript:alert(1)' },
    { ...input, website: 'https://user:password@example.test' },
  ])
    assert.equal(place_input.safeParse(invalid).success, false);
  assert.equal(place_list.safeParse({ page_size: 51 }).success, false);
  assert.equal(place_list.safeParse({ scope: 'someone-else' }).success, false);
  assert.equal(
    place_review.safeParse({ score: 6, comment: 'test' }).success,
    false,
  );
  assert.equal(
    place_review.safeParse({ score: 5, comment: ' ' }).success,
    false,
  );
  assert.equal(
    place_dedupe_key(input),
    place_dedupe_key({ ...input, name: '  RIVER   cafe  ' }),
  );
  assert.notEqual(
    place_dedupe_key(input),
    place_dedupe_key({ ...input, latitude: 25.24 }),
  );
});
it('a shared place save deduplicates the place and creates only the current account bookmark with an atomic audit', async () => {
  const f = fixture();
  await f.repo.create('owner', input);
  const create = f.calls.find(([name]) => name === 'place')![1];
  const bookmark = f.calls.find(([name]) => name === 'save')![1];
  assert.equal(create.create.created_by_id, 'owner');
  assert.deepEqual(create.update, {});
  assert.deepEqual(bookmark.where, {
    user_id_community_place_id: {
      user_id: 'owner',
      community_place_id: 'place',
    },
  });
  assert.equal(f.calls.at(-1)![1].data.action, 'SAVE_SHARED_PLACE');
});
it('visits, unsaves and review changes never mutate another account or delete shared place content', async () => {
  const f = fixture();
  await f.repo.visit('owner', 'place', true);
  await f.repo.visit('owner', 'place', false);
  await f.repo.bookmark('owner', 'place', false);
  await f.repo.review('owner', 'place', { score: 4, comment: 'Quiet spot' });
  await f.repo.review('owner', 'place', null);
  assert.deepEqual(f.calls.find(([name]) => name === 'visit')![1].update, {});
  for (const key of ['unvisit', 'unreview'])
    assert.deepEqual(f.calls.find(([name]) => name === key)![1].where, {
      place_id: 'place',
      user_id: 'owner',
    });
  assert.deepEqual(f.calls.find(([name]) => name === 'unsave')![1].where, {
    user_id: 'owner',
    community_place_id: 'place',
  });
  assert.equal(f.calls.filter(([name]) => name === 'audit').length, 5);
});
it('place edits require both the contributor and the exact revision; inactive accounts cannot write', async () => {
  const f = fixture();
  await f.repo.update('owner', 'place', { ...input, version: 3 });
  assert.deepEqual(f.calls.find(([name]) => name === 'update')![1].where, {
    id: 'place',
    created_by_id: 'owner',
    version: 3,
  });
  f.tx.communityPlace.updateMany = async () => ({ count: 0 });
  await assert.rejects(
    () => f.repo.update('other', 'place', { ...input, version: 3 }),
    (e: any) => e.error_code === 'PLACE_CHANGED',
  );
  f.tx.user.findUnique = async () => ({ status: 'SUSPENDED' });
  await assert.rejects(
    () => f.repo.visit('owner', 'place', true),
    (e: any) => e.error_code === 'USER_INACTIVE',
  );
});
it('photo replay keeps the original attachment and rejects changed payloads and foreign removal', async () => {
  const f = fixture();
  const photo = {
    id: 'photo',
    place_id: 'place',
    content_hash: 'hash',
    url: 'https://image.test/photo.webp',
  };
  f.tx.placePhoto.findUnique = async () => photo;
  const result = await f.repo.photo('owner', 'place', {
    request_key: 'request-key',
    content_hash: 'hash',
    url: 'new',
    public_id: 'new',
  });
  assert.equal(result.reused, true);
  await assert.rejects(
    () =>
      f.repo.photo('owner', 'place', {
        request_key: 'request-key',
        content_hash: 'different',
        url: 'new',
        public_id: 'new',
      }),
    (e: any) => e.error_code === 'PHOTO_REQUEST_CONFLICT',
  );
  await assert.rejects(
    () => f.repo.remove_photo('other', 'place', 'photo'),
    (e: any) => e.error_code === 'PLACE_PHOTO_NOT_FOUND',
  );
});
it('a previously committed place photo is returned without another cloud upload', async () => {
  const { createHash } = await import('node:crypto');
  const f = fixture();
  const image_upload = {
    file_name: 'photo.png',
    data_url: 'data:image/png;base64,example',
  };
  const content_hash = createHash('sha256')
    .update(image_upload.data_url)
    .digest('hex');
  Object.defineProperty(f.repo, 'photo_by_key', {
    value: async () => ({
      id: 'photo',
      place_id: 'place',
      content_hash,
      url: 'https://image.test/photo.webp',
    }),
  });
  const images = new CloudinaryService();
  Object.defineProperty(images, 'upload_image', {
    value: async () => {
      throw new Error('Cloud must not be called');
    },
  });
  const result = await new PlacesService(f.repo, images).photo(
    'owner',
    'place',
    { image_upload, request_key: 'request-key' },
  );
  assert.equal(result.id, 'photo');
});
it('shared lists keep bookmarks account-scoped and return bounded public identities and database ratings', async () => {
  const f = fixture();
  let query: any;
  f.tx.communityPlace.findMany = async (args: any) => {
    query = args;
    return [
      {
        ...input,
        id: 'place',
        dedupe_key: 'internal',
        photos: [],
        saved_places: [{ id: 'save' }],
        _count: { visits: 8, reviews: 4 },
        visits: [
          {
            user: {
              id: 'visitor',
              first_name: 'Alex',
              last_name: 'Morgan',
              status: 'ACTIVE',
            },
            visited_at: new Date(),
          },
        ],
      },
    ];
  };
  f.tx.communityPlace.count = async () => 51;
  f.tx.placeReview.groupBy = async () => [
    { place_id: 'place', _avg: { score: 4.25 } },
  ];
  f.tx.placeVisit.findMany = async (args: any) => {
    assert.equal(args.where.user_id, 'viewer');
    return [];
  };
  const result = await f.repo.list(
    'viewer',
    place_list.parse({ scope: 'saved', query: 'cafe', page: 2 }),
  );
  assert.deepEqual(query.where.saved_places, { some: { user_id: 'viewer' } });
  assert.equal(query.where.OR[0].name.mode, 'insensitive');
  assert.equal(query.skip, 20);
  assert.equal(query.take, 20);
  assert.equal(query.include.photos.take, 1);
  assert.equal(query.include.visits.take, 3);
  assert.equal(query.include.visits.select.user.select.phone_e164, undefined);
  assert.equal(result.total, 51);
  assert.equal(result.rows[0]!.rating, 4.25);
  assert.equal(result.rows[0]!.visitor_count, 8);
  assert.equal(result.rows[0]!.saved, true);
  assert.equal('dedupe_key' in result.rows[0]!, false);
  assert.equal('status' in result.rows[0]!.visitors[0]!.user, false);
});
