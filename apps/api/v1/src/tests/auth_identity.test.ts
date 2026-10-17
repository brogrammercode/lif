import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { OAuth2Client } from 'google-auth-library';
import { verify_google_identity } from '../features/auth/auth.security.js';
import { AppError } from '../core/error.js';

afterEach(() => mock.restoreAll());

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
