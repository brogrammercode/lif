import nodemailer from 'nodemailer';
import { config } from '../../core/config.js';

export function smtp_transport() {
  // Do not combine `service: gmail` with explicit options: the service preset
  // replaces host/port/TLS settings. App passwords may contain display spaces.
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: !config.SMTP_SECURE,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    auth: {
      user: config.MAIL_USER,
      pass: config.GOOGLE_APP_PASSWORD.replace(/\s+/g, ''),
    },
  });
}
export function smtp_failure(error: unknown): string {
  if (!config.MAIL_USER || !config.GOOGLE_APP_PASSWORD)
    return 'SMTP is not configured. Set MAIL_USER and GOOGLE_APP_PASSWORD in the API deployment.';
  const code = (error as { code?: string })?.code;
  if (code === 'EAUTH')
    return 'SMTP authentication failed. Check MAIL_USER and its app password.';
  if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET')
    return 'SMTP connection failed. Check the deployment network and SMTP host/port.';
  if (code === 'EENVELOPE') return 'SMTP rejected the recipient address.';
  // Never persist raw SMTP errors, which may contain credentials or mail bodies.
  return 'Email delivery failed. Check SMTP configuration and retry.';
}
