import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { OAuth2Client } from 'google-auth-library';
import { verify_google_identity } from '../features/auth/auth.security.js';
import { AppError } from '../core/error.js';
import { AuthRepository } from '../features/auth/auth.repo.js';
import type { PostgresService } from '../database/postgres.service.js';

afterEach(() => mock.restoreAll());

for (const failure_stage of ['before_write', 'claim', 'commit'] as const) {
  it(`handles a refresh transaction expiry at ${failure_stage} without replaying writes`, async () => {
    const failure = new AppError(503, 'DATABASE_BUSY', 'fixture timeout');
    const current_session = {
      id: 'session',
      user_id: 'rider',
      family_id: null,
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
    };
    const user = {
      id: 'rider',
      role: 'RIDER',
      status: 'ACTIVE',
      deleted_at: null,
    };
    let attempts = 0;
    let claims = 0;
    let rotations = 0;
    let audits = 0;
    let lookups = 0;
    const tx = {
      query: async (sql: string, args: unknown[] = []) => {
        if (sql.includes('advisory_xact_lock')) {
          if (failure_stage === 'before_write' && attempts === 1) throw failure;
          return { rows: [] };
        }
        if (sql.includes('FROM users'))
          return {
            rows: [
              {
                ...user,
                driver_profile: null,
                partner_status: null,
                exited_count: 0,
              },
            ],
          };
        if (sql.startsWith('UPDATE sessions')) {
          claims++;
          assert.deepEqual(args, [current_session.id, 'old-hash']);
          assert.match(sql, /family_id IS NULL AND revoked_at IS NULL/);
          if (failure_stage === 'claim') throw failure;
          return { rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO sessions')) {
          rotations++;
          return { rows: [{ id: 'next' }] };
        }
        if (sql.includes('INSERT INTO user_logs')) audits++;
        return { rows: [] };
      },
    };
    const repo = new AuthRepository({
      query: async () => {
        assert.equal(attempts, 0);
        lookups++;
        return { rows: [current_session] };
      },
      transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
        attempts++;
        const result = await work(tx);
        if (failure_stage === 'commit') throw failure;
        return result;
      },
    } as unknown as PostgresService);
    const result = repo.rotate_mobile_session('old-hash', 'new-hash', {});
    if (failure_stage === 'before_write') {
      assert.equal((await result)?.id, user.id);
      assert.equal(attempts, 2);
    } else {
      await assert.rejects(result, (error) => error === failure);
      assert.equal(attempts, 1);
    }
    assert.equal(lookups, 1);
    assert.equal(claims, 1);
    assert.equal(rotations, failure_stage === 'claim' ? 0 : 1);
    assert.equal(audits, rotations);
  });
}

it('normalizes the verified Google email before either app resolves an account', async () => {
  mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => ({
      sub: 'fixture-google-subject',
      email_verified: true,
      email: '  Person@Example.test  ',
      name: 'Person Example',
    }),
  }));
  const identity = await verify_google_identity(
    'fixture-token',
    'fixture-client',
  );
  assert.equal(identity.provider_email, 'person@example.test');
  assert.equal(identity.provider_account_id, 'fixture-google-subject');
});

for (const payload of [
  { sub: 'fixture-google-subject', email_verified: true },
  { sub: 'fixture-google-subject', email_verified: true, email: '  ' },
  {
    sub: 'fixture-google-subject',
    email_verified: false,
    email: 'person@example.test',
  },
  { email_verified: true, email: 'person@example.test' },
]) {
  it(`rejects incomplete or unverified Google identity: ${JSON.stringify(payload)}`, async () => {
    mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
      getPayload: () => payload,
    }));
    await assert.rejects(
      verify_google_identity('fixture-token', 'fixture-client'),
      (error: unknown) =>
        error instanceof AppError &&
        error.error_code === 'GOOGLE_TOKEN_INVALID',
    );
  });
}
