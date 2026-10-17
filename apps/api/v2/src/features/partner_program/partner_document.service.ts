import { Injectable } from '@nestjs/common';
import sanitizeHtml from '../../infra/vendor/sanitize-html.mjs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { CloudinaryService } from '../../infra/media/cloudinary.js';
import { image_upload_schema } from '../../infra/media/image_upload.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import { document_input } from './partner_program.type.js';
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
    private readonly database: PrismaService,
    private readonly media: CloudinaryService,
  ) {}
  get(kind: string) {
    return this.database.client.partnerDocument.findUnique({ where: { kind } });
  }
  async save(
    actor_id: string,
    kind: string,
    input: z.infer<typeof document_input>,
  ) {
    const uploaded: string[] = [];
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
      return await this.database.client.$transaction(
        async (tx) => {
          await require_active_admin(tx, actor_id);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(720062, hashtext(${kind}))`;
          const old = await tx.partnerDocument.findUnique({ where: { kind } });
          if ((old?.revision ?? 0) !== input.revision)
            throw new AppError(
              409,
              'STALE_DOCUMENT',
              'This document changed. Reload it before saving.',
            );
          const revision = (old?.revision ?? 0) + 1;
          const data = {
            title: input.title,
            html,
            revision,
            ...(input.publish
              ? {
                  published_title: input.title,
                  published_html: html,
                  published_version: revision,
                  published_at: new Date(),
                }
              : {}),
          };
          const doc = await tx.partnerDocument.upsert({
            where: { kind },
            create: { kind, ...data },
            update: data,
          });
          await create_user_log(tx, {
            actor_id,
            entity_type: 'PartnerDocument',
            entity_id: doc.id,
            action: input.publish
              ? 'PUBLISH_PARTNER_DOCUMENT'
              : 'SAVE_PARTNER_DOCUMENT',
            after_data: { kind, revision } as Prisma.InputJsonObject,
          });
          return doc;
        },
        { maxWait: 10000, timeout: 15000 },
      );
    } catch (error) {
      await Promise.all(uploaded.map((id) => this.media.discard_image(id)));
      throw error;
    }
  }
}
