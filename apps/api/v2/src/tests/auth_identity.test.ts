import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { OAuth2Client } from 'google-auth-library';
import { verify_google_identity } from '../features/auth/auth.security.js';
import { AppError } from '../core/error.js';
import { AuthRepository } from '../features/auth/auth.repo.js';
import type { PrismaService } from '../infra/database/prisma.service.js';

afterEach(() => mock.restoreAll());

for (const failure_stage of ['before_write', 'claim', 'commit'] as const) {
  it(`handles a refresh transaction expiry at ${failure_stage} without replaying writes`, async () => {
    const failure = { code: 'P2028' };
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
      $executeRaw: async () => {
        if (failure_stage === 'before_write' && attempts === 1) throw failure;
      },
      user: { findUnique: async () => user },
      session: {
        updateMany: async ({ where }: { where: Record<string, unknown> }) => {
          claims++;
          assert.equal(where.id, current_session.id);
          assert.equal(where.refresh_token_hash, 'old-hash');
          assert.equal(where.revoked_at, null);
          assert.equal(where.family_id, null);
          if (failure_stage === 'claim') throw failure;
          return { count: 1 };
        },
        create: async () => {
          rotations++;
          return { id: 'next' };
        },
      },
      userLog: { create: async () => ++audits },
    };
    const repo = new AuthRepository({
      client: {
        session: {
          findUnique: async () => {
            assert.equal(attempts, 0);
            lookups++;
            return current_session;
          },
        },
        $transaction: async (
          work: (client: typeof tx) => Promise<typeof user>,
        ) => {
          attempts++;
          const result = await work(tx);
          if (failure_stage === 'commit') throw failure;
          return result;
        },
      },
    } as unknown as PrismaService);
    const result = repo.rotate_mobile_session('old-hash', 'new-hash', {});
    if (failure_stage === 'before_write') {
      assert.equal(await result, user);
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
