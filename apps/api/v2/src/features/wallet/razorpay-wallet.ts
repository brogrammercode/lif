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
  error_description: z.string().nullish(),
  created_at: z.number().int().optional(),
});
const payment_list = z.object({ items: z.array(payment_schema) });
const order_schema = z.object({
  id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  receipt: z.string(),
  amount: z.number().int().positive(),
  amount_paid: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  status: z.enum(['created', 'attempted', 'paid']),
});

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

  order(id: string) {
    return this.request(`/orders/${encodeURIComponent(id)}`, order_schema);
  }

  async find_order(receipt: string) {
    const query = new URLSearchParams({ receipt, count: '2' });
    const result = await this.request(
      `/orders?${query}`,
      z.object({ items: z.array(order_schema) }),
    );
    const matches = result.items.filter((order) => order.receipt === receipt);
    if (matches.length > 1)
      throw new AppError(
        409,
        'WALLET_ORDER_CONFLICT',
        'Checkout needs review.',
      );
    return matches[0];
  }

  create_order(receipt: string, amount: number) {
    return this.request('/orders', order_schema, {
      receipt,
      amount,
      currency: 'INR',
      partial_payment: false,
    });
  }

  async settled_order_payment(order: z.infer<typeof order_schema>) {
    if (order.status !== 'paid' || order.amount_paid !== order.amount)
      return null;
    return this.match_settled_payment(order.id, order.amount, order.currency);
  }

  async order_failure(order_id: string, amount: number, currency: string) {
    const result = await this.order_payments(order_id);
    const payments = result.items.filter(
      (payment) =>
        payment.order_id === order_id &&
        payment.amount === amount &&
        payment.currency === currency,
    );
    if (
      !payments.length ||
      payments.some((payment) => payment.status !== 'failed')
    )
      return null;
    const latest = payments.sort(
      (left, right) => (right.created_at ?? 0) - (left.created_at ?? 0),
    )[0]!;
    return {
      reason:
        latest.error_description
          ?.trim()
          .replace(/[\u0000-\u001f\u007f]/g, ' ')
          .slice(0, 240) || undefined,
    };
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
    return this.match_settled_payment(
      link.order_id,
      link.amount,
      link.currency,
    );
  }

  private async match_settled_payment(
    order_id: string,
    amount: number,
    currency: string,
  ) {
    const result = await this.order_payments(order_id);
    const matches = result.items.filter(
      (payment) =>
        payment.order_id === order_id &&
        payment.amount === amount &&
        payment.currency === currency &&
        ['captured', 'refunded'].includes(payment.status) &&
        payment.amount_refunded >= 0 &&
        payment.amount_refunded <= payment.amount,
    );
    return matches.length === 1 ? matches[0]! : null;
  }

  private order_payments(order_id: string) {
    return this.request(
      `/orders/${encodeURIComponent(order_id)}/payments`,
      payment_list,
    );
  }
}
