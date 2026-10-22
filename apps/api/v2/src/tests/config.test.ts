import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { it } from 'node:test';

for (const [key, value] of Object.entries({
  PORT: '70000',
  JWT_EXPIRES_IN: 'invalid-duration',
  ADMIN_WEB_ORIGIN: 'null',
  ADMIN_NOTIFICATION_ORIGIN: 'https://one.test,https://two.test',
  CORS_ORIGIN: 'https://example.test/private/path',
})) {
  it(`rejects invalid ${key} at startup`, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "import './src/core/config.ts'",
      ],
      { encoding: 'utf8', env: { ...process.env, [key]: value } },
    );
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(key));
  });
}

it('warns about the development webhook secret without blocking production startup', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "import './src/core/config.ts'",
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PAYMENT_WEBHOOK_SECRET: 'development-webhook-secret',
      },
    },
  );
  assert.equal(result.status, 0);
  assert.ok(result.stderr.includes('EXAMPLE_SECRETS_CONFIGURED'));
  assert.ok(result.stderr.includes('PAYMENT_WEBHOOK_SECRET'));
});

for (const [key, value] of Object.entries({
  JWT_SECRET: 'replace-with-a-long-random-secret',
  PAYMENT_WEBHOOK_SECRET: 'replace-with-a-webhook-secret',
})) {
  it(`warns about the public example ${key} without blocking production startup`, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "import './src/core/config.ts'",
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'production', [key]: value },
      },
    );
    assert.equal(result.status, 0);
    assert.ok(result.stderr.includes('EXAMPLE_SECRETS_CONFIGURED'));
    assert.ok(result.stderr.includes(key));
  });
}
