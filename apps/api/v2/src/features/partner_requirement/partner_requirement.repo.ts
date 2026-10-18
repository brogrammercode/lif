import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { AppError } from '../../core/error.js';
import {
  DOCUMENT_TYPES,
  DETAIL_TYPES,
  MAX_PARTNER_FIELDS,
  type CategoryInput,
  type RequirementInput,
  type RequirementQuery,
} from './partner_requirement.type.js';
const options = { maxWait: 10000, timeout: 30000 };
@Injectable()
export class PartnerRequirementRepository {
  constructor(private readonly database: PrismaService) {}
  categories() {
    return this.database.client.requirementCategory.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { fields: true } } },
    });
  }
  list(input: RequirementQuery) {
    const where: Prisma.PartnerRequirementWhereInput = {
      ...(input.category_id ? { category_id: input.category_id } : {}),
      ...(input.section === 'details'
        ? { field_type: { in: [...DETAIL_TYPES] } }
        : input.section === 'documents'
          ? { field_type: { in: [...DOCUMENT_TYPES] } }
          : {}),
      ...(input.status !== 'all'
        ? { is_active: input.status === 'active' }
        : {}),
      ...(input.query
        ? {
            OR: [
              { label: { contains: input.query, mode: 'insensitive' } },
              { key: { contains: input.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.database.client.$transaction(
      async (tx) => {
        const total = await tx.partnerRequirement.count({ where });
        const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
        const rows = await tx.partnerRequirement.findMany({
          where,
          include: { category: true },
          orderBy: [
            { category: { sort_order: 'asc' } },
            { sort_order: 'asc' },
            { label: 'asc' },
            { id: 'asc' },
          ],
          skip: (page - 1) * 20,
          take: 20,
        });
        return { rows, total, page, page_size: 20 };
      },
      {
        ...options,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }
  async public_requirements() {
    const rows = await this.database.client.partnerRequirement.findMany({
      where: { is_active: true, category: { is_active: true } },
      include: {
        category: { select: { id: true, name: true, description: true } },
      },
      orderBy: [
        { category: { sort_order: 'asc' } },
        { sort_order: 'asc' },
        { label: 'asc' },
      ],
    });
    const documents = rows.filter((row) =>
      DOCUMENT_TYPES.some((type) => type === row.field_type),
    );
    const details = rows.filter(
      (row) => !DOCUMENT_TYPES.some((type) => type === row.field_type),
    );
    return {
      details,
      documents,
      categories: [
        ...new Map(rows.map((row) => [row.category.id, row.category])).values(),
      ],
    };
  }
  save_category(actor_id: string, input: CategoryInput, id?: string) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720051)`;
      const before = id
        ? await tx.requirementCategory.findUnique({ where: { id } })
        : null;
      if (id && !before)
        throw new AppError(
          404,
          'REQUIREMENT_CATEGORY_NOT_FOUND',
          'This category was not found.',
        );
      if (
        before &&
        before.updated_at.toISOString() !== input.expected_updated_at
      )
        throw new AppError(
          409,
          'REQUIREMENT_CONFLICT',
          'This category changed. Reload it before saving.',
        );
      const data = {
        name: input.name.trim().replace(/\s+/g, ' '),
        normalized_name: input.name.trim().replace(/\s+/g, ' ').toLowerCase(),
        description: input.description,
        sort_order: input.sort_order,
        is_active: input.is_active,
      };
      if (before && !before.is_active && input.is_active) {
        const active_fields = await tx.partnerRequirement.count({
          where: {
            is_active: true,
            OR: [{ category: { is_active: true } }, { category_id: before.id }],
          },
        });
        if (active_fields > MAX_PARTNER_FIELDS)
          throw new AppError(
            422,
            'PARTNER_FIELD_LIMIT',
            'The partner form supports up to 200 active fields. Disable some fields before enabling this category.',
          );
      }
      const row = before
        ? await tx.requirementCategory.update({ where: { id }, data })
        : await tx.requirementCategory.create({ data });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'RequirementCategory',
        entity_id: row.id,
        action: before
          ? 'UPDATE_REQUIREMENT_CATEGORY'
          : 'CREATE_REQUIREMENT_CATEGORY',
        before_data: before,
        after_data: row,
      });
      return row;
    }, options);
  }
  save_field(actor_id: string, input: RequirementInput, id?: string) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720051)`;
      const before = id
        ? await tx.partnerRequirement.findUnique({ where: { id } })
        : null;
      if (id && !before)
        throw new AppError(
          404,
          'REQUIREMENT_NOT_FOUND',
          'This field was not found.',
        );
      if (
        before &&
        before.updated_at.toISOString() !== input.expected_updated_at
      )
        throw new AppError(
          409,
          'REQUIREMENT_CONFLICT',
          'This field changed. Reload it before saving.',
        );
      if (before && before.key !== input.key)
        throw new AppError(
          422,
          'FIELD_KEY_IMMUTABLE',
          'The field key cannot change. Create a new field if a different key is needed.',
        );
      const category = await tx.requirementCategory.findUnique({
        where: { id: input.category_id },
      });
      if (
        !category ||
        (!category.is_active && before?.category_id !== category.id)
      )
        throw new AppError(
          422,
          'REQUIREMENT_CATEGORY_UNAVAILABLE',
          'Choose an active field category.',
        );
      const document = DOCUMENT_TYPES.some((type) => type === input.field_type);
      if (
        input.field_type === 'NUMBER' &&
        input.min_value !== null &&
        input.max_value !== null &&
        input.min_value > input.max_value
      )
        throw new AppError(
          422,
          'FIELD_RANGE_INVALID',
          'The minimum value cannot exceed the maximum.',
        );
      if (input.field_type === 'FILE' && !input.allowed_extensions.length)
        throw new AppError(
          422,
          'FILE_TYPES_REQUIRED',
          'Choose the permitted file extensions.',
        );
      if (
        input.is_active &&
        category.is_active &&
        (!before?.is_active || before.category_id !== category.id)
      ) {
        const other_fields = await tx.partnerRequirement.count({
          where: {
            is_active: true,
            category: { is_active: true },
            ...(id ? { id: { not: id } } : {}),
          },
        });
        if (other_fields >= MAX_PARTNER_FIELDS)
          throw new AppError(
            422,
            'PARTNER_FIELD_LIMIT',
            'The partner form supports up to 200 active fields. Disable another field before adding this one.',
          );
      }
      const data = {
        category_id: input.category_id,
        key: input.key,
        label: input.label,
        field_type: input.field_type,
        description: input.description,
        placeholder:
          document || input.field_type === 'BOOLEAN' ? null : input.placeholder,
        is_required: input.is_required,
        is_active: input.is_active,
        sort_order: input.sort_order,
        min_value: input.field_type === 'NUMBER' ? input.min_value : null,
        max_value: input.field_type === 'NUMBER' ? input.max_value : null,
        max_length: ['STRING', 'TEXT'].includes(input.field_type)
          ? input.max_length
          : null,
        max_file_size_mb: document ? (input.max_file_size_mb ?? 3) : null,
        allowed_extensions:
          input.field_type === 'IMAGE'
            ? ['.jpg', '.jpeg', '.png', '.webp']
            : input.field_type === 'PDF'
              ? ['.pdf']
              : input.field_type === 'FILE'
                ? [...new Set(input.allowed_extensions)]
                : [],
        allow_multiple: document && input.allow_multiple,
      };
      const row = before
        ? await tx.partnerRequirement.update({
            where: { id },
            data,
            include: { category: true },
          })
        : await tx.partnerRequirement.create({
            data,
            include: { category: true },
          });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'PartnerRequirement',
        entity_id: row.id,
        action: before
          ? 'UPDATE_PARTNER_REQUIREMENT'
          : 'CREATE_PARTNER_REQUIREMENT',
        before_data: before,
        after_data: row,
      });
      return row;
    }, options);
  }
}
