import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../../core/config.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { reveal_activation } from './partner_program.security.js';
import { claimable_delivery } from './partner_delivery.constant.js';

@Injectable()
export class PartnerDeliveryService {
  private mailer?: Transporter;
  constructor(private readonly database: PrismaService) {}
  send_email(application_id: string) {
    return this.send_document(application_id, 'EMAIL');
  }
  send_exit_email(application_id: string) {
    return this.send_document(application_id, 'EXIT_EMAIL');
  }
  send_activation_email(application_id: string) {
    return this.send_document(application_id, 'ACTIVATION_EMAIL');
  }
  private async send_document(
    application_id: string,
    channel: 'EMAIL' | 'EXIT_EMAIL' | 'ACTIVATION_EMAIL',
  ) {
    const is_exit = channel === 'EXIT_EMAIL';
    const is_activation = channel === 'ACTIVATION_EMAIL';
    const delivery = await this.database.client.partnerDelivery.findUnique({
      where: { application_id_channel: { application_id, channel } },
    });
    if (!delivery || delivery.status === 'SENT') return;
    const now = new Date();
    const claimed = await this.database.client.partnerDelivery.updateMany({
      where: {
        id: delivery.id,
        ...claimable_delivery(now),
      },
      data: {
        status: 'SENDING',
        claimed_at: now,
        attempts: { increment: 1 },
        last_error: null,
      },
    });
    if (!claimed.count) return;
    try {
      if (!config.MAIL_USER || !config.GOOGLE_APP_PASSWORD)
        throw new Error(
          'SMTP is not configured. Set MAIL_USER and GOOGLE_APP_PASSWORD in the API environment.',
        );
      const app = await this.database.client.partnerApplication.findUnique({
        where: { id: application_id },
        include: {
          exit_request: true,
          user: {
            select: { status: true, deleted_at: true, first_name: true },
          },
        },
      });
      if (
        !app ||
        !(is_exit
          ? app.status === 'EXITED' && app.exit_request?.status === 'COMPLETED'
          : ['COMPLETED', 'ACTIVATED'].includes(app.status)) ||
        app.user.status !== 'ACTIVE' ||
        app.user.deleted_at ||
        (is_activation &&
          (app.status !== 'COMPLETED' || !app.activation_ciphertext)) ||
        !(is_exit ? app.exit_request?.settlement_pdf_id : app.final_pdf_id)
      )
        throw new Error(
          'The approved application or its recipient is no longer available.',
        );
      const asset = await this.database.client.partnerAsset.findFirst({
        where: {
          id: (is_exit
            ? app.exit_request?.settlement_pdf_id
            : app.final_pdf_id)!,
          owner_id: app.user_id,
          purpose: is_exit ? 'EXIT_PDF' : 'FINAL_PDF',
          ...(is_exit ? { field_id: app.exit_request!.id } : {}),
          mime_type: 'application/pdf',
        },
      });
      if (!asset) throw new Error('The approved final PDF is unavailable.');
      this.mailer ??= nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        auth: {
          user: config.MAIL_USER,
          pass: config.GOOGLE_APP_PASSWORD.replace(/\s+/g, ''),
        },
      });
      const result = await this.mailer.sendMail({
        from: { name: config.MAIL_FROM_NAME, address: config.MAIL_USER },
        to: app.contact_email,
        subject: is_activation
          ? 'Your 1More driver activation code'
          : is_exit
            ? 'Your 1More partner exit settlement'
            : 'Your 1More Partner Program confirmation',
        text: is_activation
          ? `Hello ${app.user.first_name ?? 'there'},\n\nYour 1More driver activation code is ${reveal_activation(app.activation_ciphertext!)}.\n\nEnter this code in the 1More app after signing in. This code has no expiry and can be used once. Do not share it with anyone. Your approved confirmation PDF is attached for reference.\n\n1More Partner Program`
          : is_exit
            ? `Hello ${app.user.first_name ?? 'there'},\n\nYour Partner Program exit is complete. Your settlement PDF is attached and available in the 1More app under Exit Request & Dues. Driver operations are now disabled. Your account and history remain available. Please refer to the attached document for dues and settlement details.\n\n1More Partner Program`
            : `Hello ${app.user.first_name ?? 'there'},\n\nYour Partner Program confirmation has been approved. Your final document is attached and is also available in the 1More app.\n\nSign out and sign in again to begin driver activation. Your administrator will send your activation code separately.\n\n1More Partner Program`,
        attachments: [
          {
            filename: asset.file_name,
            content: Buffer.from(asset.content),
            contentType: 'application/pdf',
          },
        ],
      });
      if (!result.accepted?.length)
        throw new Error('The email server did not accept the recipient.');
      await this.database.client.partnerDelivery.updateMany({
        where: { id: delivery.id, status: 'SENDING', claimed_at: now },
        data: {
          status: 'SENT',
          sent_at: new Date(),
          provider_id: String(result.messageId).slice(0, 500),
          last_error: null,
        },
      });
    } catch (error) {
      await this.database.client.partnerDelivery.updateMany({
        where: { id: delivery.id, status: 'SENDING', claimed_at: now },
        data: {
          status: 'FAILED',
          last_error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Email delivery failed. Retry from admin.',
        },
      });
    }
  }
}
