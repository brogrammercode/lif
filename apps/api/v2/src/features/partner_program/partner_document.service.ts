import { Injectable } from '@nestjs/common';
import sanitizeHtml from '../../infra/vendor/sanitize-html.mjs';
import type { PartnerDocument } from './partner.rows.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { nextEntityId } from '../../database/entity-id.js';
import { CloudinaryService } from '../../infra/media/cloudinary.js';
import { image_upload_schema } from '../../infra/media/image_upload.js';
import { requireActiveAdmin } from '../../database/account-locks.js';
import { insertUserLog } from '../../database/user-log.js';
import { AppError } from '../../core/error.js';
import { document_input } from './dto/partner-program.dto.js';
import type { z } from 'zod';

export const clean_document = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'span',
      'div',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'hr',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'colgroup',
      'col',
      'sup',
      'sub',
      'label',
      'input',
    ],
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      td: ['colspan', 'rowspan', 'colwidth'],
      th: ['colspan', 'rowspan', 'colwidth'],
      col: ['width'],
      ul: ['data-type'],
      li: ['data-type', 'data-checked'],
      input: ['type', 'checked', 'disabled'],
    },
    allowedSchemes: ['https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https'] },
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,]+\)$/i],
        'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,]+\)$/i],
        'text-align': [/^(left|right|center|justify)$/],
        'font-family': [/^[a-zA-Z\s,'"-]{1,100}$/],
        'font-size': [/^\d{1,3}(px|pt|em|rem)$/],
        'line-height': [/^[\d.]{1,5}(px|em|rem|%)?$/],
        width: [/^\d{1,4}(px|%)$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
      input: sanitizeHtml.simpleTransform('input', {
        type: 'checkbox',
        disabled: 'disabled',
      }),
    },
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !/^https:\/\/res\.cloudinary\.com\//i.test(frame.attribs.src ?? ''),
  });
export const published_document = (
  doc: {
    title: string;
    published_title: string | null;
    published_html: string | null;
    published_version: number;
    published_at: Date | null;
  } | null,
) =>
  doc?.published_html && doc.published_at
    ? {
        title: doc.published_title ?? doc.title,
        html: doc.published_html,
        version: doc.published_version,
        published_at: doc.published_at.toISOString(),
      }
    : null;

@Injectable()
export class PartnerDocumentService {
  constructor(
    private readonly database: PostgresService,
    private readonly media: CloudinaryService,
  ) {}
  async get(kind: string, db: SqlClient = this.database) {
    const { rows } = await db.query<PartnerDocument>(
      'SELECT * FROM partner_documents WHERE kind=$1',
      [kind],
    );
    return rows[0] ?? null;
  }
  async save(
    actor_id: string,
    kind: string,
    input: z.infer<typeof document_input>,
  ) {
    const uploaded: string[] = [];
    let writeAttempted = false;
    try {
      let html = input.html;
      const images = [
        ...new Set(
          html.match(/data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+/g) ??
            [],
        ),
      ];
      if (images.length > 12)
        throw new AppError(
          422,
          'TOO_MANY_IMAGES',
          'Use at most 12 new images per save.',
        );
      for (const data_url of images) {
        const image = image_upload_schema.parse({
          file_name: 'document-image',
          data_url,
        });
        const result = await this.media.upload_image(
          image,
          'partner-documents',
        );
        uploaded.push(result.public_id);
        html = html.split(data_url).join(result.url);
      }
      html = clean_document(html);
      if (Buffer.byteLength(html, 'utf8') > 500_000)
        throw new AppError(
          422,
          'DOCUMENT_TOO_LARGE',
          'Keep document text and formatting below 500 KB. Images are stored separately.',
        );
      if (
        input.publish &&
        !sanitizeHtml(html, {
          allowedTags: [],
          allowedAttributes: {},
        }).trim() &&
        !html.includes('<img')
      )
        throw new AppError(
          422,
          'EMPTY_DOCUMENT',
          'Write the document before publishing.',
        );
      return await this.database.transaction(async (tx) => {
        await requireActiveAdmin(tx, actor_id);
        await tx.query('SELECT pg_advisory_xact_lock(720062,hashtext($1))', [
          kind,
        ]);
        const old = await this.get(kind, tx);
        if ((old?.revision ?? 0) !== input.revision)
          throw new AppError(
            409,
            'STALE_DOCUMENT',
            'This document changed. Reload it before saving.',
          );
        const revision = (old?.revision ?? 0) + 1;
        writeAttempted = true;
        const { rows } = await tx.query<PartnerDocument>(
          `INSERT INTO partner_documents (id,kind,title,html,revision,published_title,published_html,
            published_version,published_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,CASE WHEN $6::boolean THEN $3 END,CASE WHEN $6 THEN $4 END,
            CASE WHEN $6 THEN $5 ELSE 0 END,CASE WHEN $6 THEN clock_timestamp() END,clock_timestamp())
          ON CONFLICT (kind) DO UPDATE SET title=EXCLUDED.title,html=EXCLUDED.html,revision=EXCLUDED.revision,
            published_title=CASE WHEN $6 THEN EXCLUDED.published_title ELSE partner_documents.published_title END,
            published_html=CASE WHEN $6 THEN EXCLUDED.published_html ELSE partner_documents.published_html END,
            published_version=CASE WHEN $6 THEN EXCLUDED.published_version ELSE partner_documents.published_version END,
            published_at=CASE WHEN $6 THEN EXCLUDED.published_at ELSE partner_documents.published_at END,
            updated_at=clock_timestamp() RETURNING *`,
          [
            old?.id ?? nextEntityId(),
            kind,
            input.title,
            html,
            revision,
            input.publish,
          ],
        );
        const doc = rows[0]!;
        await insertUserLog(tx, {
          actor_id,
          entity_type: 'PartnerDocument',
          entity_id: doc.id,
          action: input.publish
            ? 'PUBLISH_PARTNER_DOCUMENT'
            : 'SAVE_PARTNER_DOCUMENT',
          after_data: { kind, revision },
        });
        return doc;
      });
    } catch (error) {
      if (
        !writeAttempted ||
        (error instanceof AppError && error.status_code < 500)
      )
        await Promise.all(uploaded.map((id) => this.media.discard_image(id)));
      throw error;
    }
  }
}
