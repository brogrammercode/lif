import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../../core/config.js';
import { PrismaService } from '../../infra/database/prisma.service.js';

@Injectable()
export class PartnerDeliveryService {
  private mailer?: Transporter;
  constructor(private readonly database: PrismaService) {}
  async send_email(application_id: string) {
    const delivery = await this.database.client.partnerDelivery.findUnique({
      where: { application_id_channel: { application_id, channel: 'EMAIL' } },
    });
    if (!delivery || delivery.status === 'SENT') return;
    const now = new Date();
    const claimed = await this.database.client.partnerDelivery.updateMany({
      where: {
        id: delivery.id,
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          {
            status: 'SENDING',
            claimed_at: { lt: new Date(Date.now() - 300000) },
          },
        ],
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
          user: {
            select: { status: true, deleted_at: true, first_name: true },
          },
        },
      });
      if (
        !app ||
        !['COMPLETED', 'ACTIVATED'].includes(app.status) ||
        app.user.status !== 'ACTIVE' ||
        app.user.deleted_at ||
        !app.final_pdf_id
      )
        throw new Error(
          'The approved application or its recipient is no longer available.',
        );
      const asset = await this.database.client.partnerAsset.findFirst({
        where: {
          id: app.final_pdf_id,
          owner_id: app.user_id,
          purpose: 'FINAL_PDF',
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
        subject: 'Your 1More Partner Program confirmation',
        text: `Hello ${app.user.first_name ?? 'there'},\n\nYour Partner Program confirmation has been approved. Your final document is attached and is also available in the 1More app.\n\nSign out and sign in again to begin driver activation. Your administrator will send your activation code separately.\n\n1More Partner Program`,
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
