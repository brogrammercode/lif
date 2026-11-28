import { Injectable } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { smtp_transport, smtp_failure } from '../../infra/mail/smtp.js';
import { config } from '../../core/config.js';
import { PostgresService } from '../../database/postgres.service.js';
import { reveal_activation } from './partner_program.security.js';

@Injectable()
export class PartnerDeliveryService {
  private mailer?: Transporter;
  constructor(private readonly database: PostgresService) {}
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
    const now = new Date();
    const claim = await this.database.query<{ id: string }>(
      `UPDATE partner_deliveries SET status='SENDING',claimed_at=$3,attempts=attempts+1,
        last_error=NULL,updated_at=clock_timestamp()
      WHERE application_id=$1 AND channel=$2 AND (
        status IN ('PENDING','FAILED') OR
        (status='SENDING' AND COALESCE(claimed_at,updated_at)<$4)
      ) RETURNING id`,
      [application_id, channel, now, new Date(now.getTime() - 300000)],
    );
    const delivery = claim.rows[0];
    if (!delivery) return;
    const finish = (
      status: 'SENT' | 'SKIPPED' | 'FAILED',
      reason: string | null,
      provider?: string,
    ) =>
      this.database.query(
        `UPDATE partner_deliveries SET status=$3,last_error=$4,
          sent_at=CASE WHEN $3='SENT' THEN clock_timestamp() ELSE sent_at END,
          provider_id=CASE WHEN $3='SENT' THEN $5 ELSE provider_id END,updated_at=clock_timestamp()
        WHERE id=$1 AND status='SENDING' AND claimed_at=$2`,
        [delivery.id, now, status, reason, provider],
      );
    try {
      const { rows } = await this.database.query<{
        user_id: string;
        status: string;
        contact_email: string;
        activation_ciphertext: string | null;
        final_pdf_id: string | null;
        exit_id: string | null;
        exit_status: string | null;
        settlement_pdf_id: string | null;
        user_status: string;
        deleted_at: Date | null;
        first_name: string | null;
      }>(
        `SELECT a.user_id,a.status,a.contact_email,a.activation_ciphertext,a.final_pdf_id,
          e.id AS exit_id,e.status AS exit_status,e.settlement_pdf_id,
          u.status AS user_status,u.deleted_at,u.first_name
        FROM partner_applications a JOIN users u ON u.id=a.user_id
          LEFT JOIN partner_exit_requests e ON e.application_id=a.id WHERE a.id=$1`,
        [application_id],
      );
      const app = rows[0];
      const assetId = is_exit ? app?.settlement_pdf_id : app?.final_pdf_id;
      if (
        !app ||
        !assetId ||
        !(is_exit
          ? app.status === 'EXITED' && app.exit_status === 'COMPLETED'
          : ['COMPLETED', 'ACTIVATED'].includes(app.status)) ||
        app.user_status !== 'ACTIVE' ||
        app.deleted_at ||
        (is_activation &&
          (app.status !== 'COMPLETED' || !app.activation_ciphertext))
      ) {
        await finish(
          'SKIPPED',
          'This recipient or workflow is no longer eligible for this email.',
        );
        return;
      }
      const assets = await this.database.query<{
        file_name: string;
        content: Buffer;
      }>(
        `SELECT file_name,content FROM partner_assets WHERE id=$1 AND owner_id=$2
          AND purpose=$3 AND mime_type='application/pdf' AND ($4::text IS NULL OR field_id=$4)`,
        [
          assetId,
          app.user_id,
          is_exit ? 'EXIT_PDF' : 'FINAL_PDF',
          is_exit ? app.exit_id : null,
        ],
      );
      const asset = assets.rows[0];
      if (!asset) throw new Error('The approved final PDF is unavailable.');
      if (!config.MAIL_USER || !config.GOOGLE_APP_PASSWORD)
        throw new Error(
          'SMTP is not configured. Set MAIL_USER and GOOGLE_APP_PASSWORD in the API environment.',
        );
      this.mailer ??= smtp_transport();
      const result = await this.mailer.sendMail({
        from: { name: config.MAIL_FROM_NAME, address: config.MAIL_USER },
        to: app.contact_email,
        messageId: `<partner-${delivery.id}@${config.MAIL_USER.split('@')[1]}>`,
        subject: is_activation
          ? 'Your 1More driver activation code'
          : is_exit
            ? 'Your 1More partner exit settlement'
            : 'Your 1More Partner Program confirmation',
        text: is_activation
          ? `Hello ${app.first_name ?? 'there'},\n\nYour 1More driver activation code is ${reveal_activation(app.activation_ciphertext!)}.\n\nEnter this code in the 1More app after signing in. This code has no expiry and can be used once. Do not share it with anyone. Your approved confirmation PDF is attached for reference.\n\n1More Partner Program`
          : is_exit
            ? `Hello ${app.first_name ?? 'there'},\n\nYour Partner Program exit is complete. You can continue using the same account as a rider. Your settlement PDF is attached and is also available in the app under Past Driver Settlements. Please refer to the attached document for dues and settlement details.\n\n1More Partner Program`
            : `Hello ${app.first_name ?? 'there'},\n\nYour Partner Program confirmation has been approved. Your final document is attached and is also available in the 1More app.\n\nSign out and sign in again to begin driver activation. Your administrator will send your activation code separately.\n\n1More Partner Program`,
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
      await finish('SENT', null, String(result.messageId).slice(0, 500));
    } catch (error) {
      const reason = smtp_failure(error);
      console.warn({
        event: 'PARTNER_EMAIL_FAILED',
        application_id,
        channel,
        reason,
      });
      await finish('FAILED', reason);
    }
  }
}
