Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_STRING: 'postgresql://test:test@127.0.0.1:1/api_unit_test',
  JWT_SECRET: 'unit-test-secret-with-at-least-thirty-two-characters',
  JWT_EXPIRES_IN: '15m',
  CLOUDINARY_CLOUD_NAME: 'unit-test-cloud',
  CLOUDINARY_API_KEY: 'unit-test-key',
  CLOUDINARY_API_SECRET: 'unit-test-secret',
  ADMIN_WEB_ORIGIN: 'http://localhost:5173',
  CORS_ORIGIN: '*',
  PAYMENT_WEBHOOK_SECRET: 'unit-test-webhook-secret',
});
