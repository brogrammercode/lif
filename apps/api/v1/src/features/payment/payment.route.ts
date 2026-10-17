import { Router } from 'express';
import { async_handler } from '../../core/async_handler.js';
import { require_auth } from '../../middleware/auth.middleware.js';
import { require_idempotency } from '../../middleware/idempotency.middleware.js';
import { verify_payment_webhook } from './payment.middleware.js';
import {
  CHECKOUT_ROUTE,
  PAYMENT_ROUTE,
  PAYMENTS_ROUTE,
  RECEIPT_ROUTE,
  WEBHOOKS_ROUTE,
} from './payment.constant.js';
import {
  checkout,
  create,
  list,
  receipt,
  remove,
  webhook,
} from './payment.controller.js';

export const payment_router = Router();
payment_router.post(
  `${PAYMENTS_ROUTE}${WEBHOOKS_ROUTE}/:provider`,
  verify_payment_webhook,
  async_handler(webhook),
);
payment_router.get(PAYMENT_ROUTE, require_auth, async_handler(list));
payment_router.post(PAYMENT_ROUTE, require_auth, async_handler(create));
payment_router.delete(
  `${PAYMENT_ROUTE}/:id`,
  require_auth,
  async_handler(remove),
);
payment_router.get('/me/payment-methods', require_auth, async_handler(list));
payment_router.post(
  '/me/payment-methods/setup',
  require_auth,
  async_handler(create),
);
payment_router.delete(
  '/me/payment-methods/:id',
  require_auth,
  async_handler(remove),
);
payment_router.post(
  `${PAYMENTS_ROUTE}${CHECKOUT_ROUTE}`,
  require_auth,
  require_idempotency,
  async_handler(checkout),
);
payment_router.post(
  `/rides/:id/payment${CHECKOUT_ROUTE}`,
  require_auth,
  require_idempotency,
  async_handler(checkout),
);
payment_router.get(
  `/rides/:id${RECEIPT_ROUTE}`,
  require_auth,
  async_handler(receipt),
);
