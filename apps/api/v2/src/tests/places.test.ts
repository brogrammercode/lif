import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { PostgresService } from '../database/postgres.service.js';
import { CloudinaryService } from '../infra/media/cloudinary.js';
import { PlacesRepository } from '../features/places/places.repo.js';
import { PlacesService } from '../features/places/places.service.js';
import {
  place_input,
  place_dedupe_key,
  place_list,
  place_review,
} from '../features/places/places.type.js';
import { placeRows, placeWhere } from '../features/places/sql/places.sql.js';

const input = place_input.parse({
  name: 'River Cafe',
  address: 'Bhagalpur',
  latitude: 25.23,
  longitude: 86.95,
});
function fixture() {
  const calls: { sql: string; args: unknown[] }[] = [];
  const state = {
    status: 'ACTIVE',
    updated: true,
    photo: null as object | null,
  };
  const query = async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (sql.includes('FROM users WHERE'))
      return { rows: [{ status: state.status, deleted_at: null }] };
    if (sql.startsWith('INSERT INTO community_places'))
      return { rows: [{ id: 'place' }] };
    if (
      sql.startsWith('SELECT id FROM community_places') &&
      sql.includes('archived_at')
    )
      return { rowCount: 1 };
    if (sql.startsWith('UPDATE community_places'))
      return { rowCount: state.updated ? 1 : 0 };
    if (sql.startsWith('INSERT INTO place_reviews'))
      return { rows: [{ id: 'review' }] };
    if (sql.startsWith('SELECT * FROM place_photos'))
      return { rows: state.photo ? [state.photo] : [] };
    if (sql.includes(placeWhere) && sql.startsWith('SELECT count(*)'))
      return { rows: [{ total: 51 }] };
    if (sql === placeRows)
      return {
        rows: [{ id: 'place', saved: true, visitor_count: 8, rating: 4.25 }],
      };
    return { rows: [], rowCount: 0 };
  };
  const db = {
    query,
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
  return { repo: new PlacesRepository(db), calls, state };
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
it('a shared place save uses the dedupe lock and creates only the current account bookmark with an atomic audit', async () => {
  const f = fixture();
  await f.repo.create('owner', input);
  const lock = f.calls.find((call) => call.sql.includes('720061'))!;
  assert.deepEqual(lock.args, [place_dedupe_key(input)]);
  const create = f.calls.find((call) =>
    call.sql.startsWith('INSERT INTO community_places'),
  )!;
  assert.equal(create.args[1], 'owner');
  const save = f.calls.find((call) =>
    call.sql.startsWith('INSERT INTO saved_places'),
  )!;
  assert.deepEqual(save.args.slice(1), ['owner', 'place']);
  assert.match(
    save.sql,
    /ON CONFLICT \(user_id,community_place_id\) DO NOTHING/,
  );
  assert.equal(f.calls.at(-1)!.args[4], 'SAVE_SHARED_PLACE');
});
it('visits, unsaves and review changes stay scoped to the acting account', async () => {
  const f = fixture();
  await f.repo.visit('owner', 'place', true);
  await f.repo.visit('owner', 'place', false);
  await f.repo.bookmark('owner', 'place', false);
  await f.repo.review('owner', 'place', { score: 4, comment: 'Quiet spot' });
  await f.repo.review('owner', 'place', null);
  for (const table of ['place_visits', 'place_reviews']) {
    const call = f.calls.find((item) =>
      item.sql.startsWith('DELETE FROM ' + table),
    )!;
    assert.deepEqual(call.args, ['place', 'owner']);
    assert.match(call.sql, /WHERE place_id=\$1 AND user_id=\$2/);
  }
  assert.deepEqual(
    f.calls.find((call) => call.sql.startsWith('DELETE FROM saved_places'))!
      .args,
    ['owner', 'place'],
  );
  assert.equal(
    f.calls.filter((call) => call.sql.includes('INSERT INTO user_logs')).length,
    5,
  );
});
it('place edits require the contributor and exact revision; inactive accounts cannot write', async () => {
  const f = fixture();
  await f.repo.update('owner', 'place', { ...input, version: 3 });
  const edit = f.calls.find((call) =>
    call.sql.startsWith('UPDATE community_places'),
  )!;
  assert.deepEqual(edit.args.slice(0, 3), ['place', 'owner', 3]);
  assert.match(
    edit.sql,
    /WHERE id=\$1 AND created_by_id=\$2 AND version=\$3 AND archived_at IS NULL/,
  );
  f.state.updated = false;
  await assert.rejects(
    f.repo.update('other', 'place', { ...input, version: 3 }),
    { error_code: 'PLACE_CHANGED' },
  );
  f.state.status = 'SUSPENDED';
  await assert.rejects(f.repo.visit('owner', 'place', true), {
    error_code: 'USER_INACTIVE',
  });
});
it('photo replay keeps the original attachment and rejects changed payloads and foreign removal', async () => {
  const f = fixture();
  f.state.photo = {
    id: 'photo',
    place_id: 'place',
    content_hash: 'hash',
    url: 'https://image.test/photo.webp',
  };
  const input = {
    request_key: 'request-key',
    content_hash: 'hash',
    url: 'new',
    public_id: 'new',
  };
  assert.equal((await f.repo.photo('owner', 'place', input)).reused, true);
  await assert.rejects(
    f.repo.photo('owner', 'place', { ...input, content_hash: 'different' }),
    { error_code: 'PHOTO_REQUEST_CONFLICT' },
  );
  await assert.rejects(f.repo.remove_photo('other', 'place', 'photo'), {
    error_code: 'PLACE_PHOTO_NOT_FOUND',
  });
});
it('a previously committed place photo is returned without another cloud upload', async () => {
  const { createHash } = await import('node:crypto');
  const f = fixture();
  const image_upload = {
    file_name: 'photo.png',
    data_url: 'data:image/png;base64,example',
  };
  f.state.photo = {
    id: 'photo',
    place_id: 'place',
    content_hash: createHash('sha256')
      .update(image_upload.data_url)
      .digest('hex'),
    url: 'https://image.test/photo.webp',
  };
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
it('shared lists scope bookmarks to the viewer and use bounded public projections and database ratings', async () => {
  const f = fixture();
  const result = await f.repo.list(
    'viewer',
    place_list.parse({ scope: 'saved', query: 'cafe', page: 2 }),
  );
  const { sql, args } = f.calls.find((call) => call.sql === placeRows)!;
  assert.deepEqual(args, [
    'viewer',
    'saved',
    undefined,
    'cafe',
    null,
    1,
    20,
    20,
  ]);
  assert.match(sql, /s.user_id=\$1/);
  assert.match(sql, /LIMIT 3/);
  assert.doesNotMatch(sql, /phone_e164|dedupe_key/);
  assert.equal(result.total, 51);
  assert.equal(result.rows[0]!.rating, 4.25);
  assert.equal(result.rows[0]!.visitor_count, 8);
  assert.equal(result.rows[0]!.saved, true);
});
