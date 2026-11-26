import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { gateway_credential_mode } from './wallet-controls.js';

const link_schema = z.object({
  id: z.string().regex(/^plink_[A-Za-z0-9]+$/),
  order_id: z
    .string()
    .regex(/^order_[A-Za-z0-9]+$/)
    .nullish(),
  reference_id: z.string(),
  short_url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['rzp.io', 'razorpay.com', 'pay.razorpay.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  }),
  amount: z.number().int().positive(),
  amount_paid: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  status: z.enum(['created', 'partially_paid', 'paid', 'expired', 'cancelled']),
});
export type RazorpayWalletLink = z.infer<typeof link_schema>;

const payment_schema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  order_id: z.string(),
  amount: z.number().int(),
  amount_refunded: z.number().int(),
  currency: z.string(),
  status: z.string(),
});
const payment_list = z.object({ items: z.array(payment_schema) });

@Injectable()
export class RazorpayWallet {
  get credential_mode() {
    return gateway_credential_mode();
  }

  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.RAZORPAY_WALLET_KEY_ID}:${config.RAZORPAY_WALLET_KEY_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.ok) return schema.parse(await response.json());
    } catch {
      // Provider errors can contain credentials or payment data.
    }
    throw new AppError(
      503,
      'WALLET_PROVIDER_UNAVAILABLE',
      'Checkout status is temporarily unavailable. Try checking again.',
    );
  }

  async find(reference: string) {
    const query = new URLSearchParams({ reference_id: reference, count: '2' });
    const result = await this.request(
      `/payment_links?${query}`,
      z.object({ payment_links: z.array(link_schema) }),
    );
    const matches = result.payment_links.filter(
      (link) => link.reference_id === reference,
    );
    if (matches.length > 1)
      throw new AppError(
        409,
        'WALLET_LINK_CONFLICT',
        'Checkout needs review before it can continue.',
      );
    return matches[0];
  }

  create(reference: string, amount: number, expire_by: number) {
    return this.request('/payment_links', link_schema, {
      reference_id: reference,
      amount,
      currency: 'INR',
      accept_partial: false,
      description: '1More wallet top-up',
      expire_by,
      notify: { sms: false, email: false },
      reminder_enable: false,
    });
  }

  fetch(id: string) {
    return this.request(
      `/payment_links/${encodeURIComponent(id)}`,
      link_schema,
    );
  }

  payment(id: string) {
    return this.request(`/payments/${encodeURIComponent(id)}`, payment_schema);
  }

  dispute(id: string) {
    return this.request(
      `/disputes/${encodeURIComponent(id)}`,
      z.object({
        id: z.string(),
        payment_id: z.string(),
        currency: z.string(),
        status: z.string(),
        amount_deducted: z.number().int().nonnegative().nullish(),
      }),
    );
  }

  async captured(link: RazorpayWalletLink) {
    const payment = await this.settled_payment(link);
    return payment?.status === 'captured' && payment.amount_refunded === 0
      ? payment.id
      : null;
  }

  async settled_payment(link: RazorpayWalletLink) {
    if (
      link.status !== 'paid' ||
      link.amount_paid !== link.amount ||
      !link.order_id
    )
      return null;
    const result = await this.request(
      `/orders/${encodeURIComponent(link.order_id)}/payments`,
      payment_list,
    );
    const matches = result.items.filter(
      (payment) =>
        payment.order_id === link.order_id &&
        payment.amount === link.amount &&
        payment.currency === link.currency &&
        ['captured', 'refunded'].includes(payment.status) &&
        payment.amount_refunded >= 0 &&
        payment.amount_refunded <= payment.amount,
    );
    return matches.length === 1 ? matches[0]! : null;
  }
}
