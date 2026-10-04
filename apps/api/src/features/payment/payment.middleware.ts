import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { WEBHOOK_SIGNATURE_HEADER } from './payment.constant.js';

export const verify_payment_webhook: RequestHandler = (request, _response, next) => {
  const signature = request.header(WEBHOOK_SIGNATURE_HEADER);
  if (!signature) {
    next(new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Payment webhook signature is required'));
    return;
  }
  const expected = createHmac('sha256', config.PAYMENT_WEBHOOK_SECRET).update(JSON.stringify(request.body)).digest('hex');
  const received_buffer = Buffer.from(signature);
  const expected_buffer = Buffer.from(expected);
  if (received_buffer.length !== expected_buffer.length || !timingSafeEqual(received_buffer, expected_buffer)) {
    next(new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Payment webhook signature is invalid'));
    return;
  }
  next();
};
