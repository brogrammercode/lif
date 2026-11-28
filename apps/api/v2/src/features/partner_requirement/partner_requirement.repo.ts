import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { requireActiveAdmin } from '../../database/account-locks.js';
import { insertUserLog } from '../../database/user-log.js';
import { nextEntityId } from '../../database/entity-id.js';
import { AppError } from '../../core/error.js';
import { input_kind } from '../partner_program/partner_field.rules.js';
import {
  DOCUMENT_TYPES,
  DETAIL_TYPES,
  MAX_PARTNER_FIELDS,
  type CategoryInput,
  type RequirementInput,
  type RequirementQuery,
} from './partner_requirement.type.js';
import {
  insertCategory,
  updateCategory,
  insertRequirement,
  updateRequirement,
  requirementFilters,
  touchCategories,
} from './sql/requirements.sql.js';

type Category = Omit<CategoryInput, 'expected_updated_at'> & {
  id: string;
  normalized_name: string;
  created_at: Date;
  updated_at: Date;
};

type Requirement = Omit<RequirementInput, 'expected_updated_at'> & {
  id: string;
  created_at: Date;
  updated_at: Date;
};

const categoryById = 'SELECT * FROM requirement_categories WHERE id=$1';
const requirementById = 'SELECT * FROM partner_requirements WHERE id=$1';

@Injectable()
export class PartnerRequirementRepository {
  constructor(private readonly database: PostgresService) {}

  async categories() {
    const result = await this.database.query<
      Category & { _count: { fields: number } }
    >(
      `SELECT c.*, jsonb_build_object('fields',
        (SELECT count(*) FROM partner_requirements WHERE category_id=c.id)) AS "_count"
      FROM requirement_categories c ORDER BY sort_order,name,id`,
    );
    return result.rows;
  }

  list(input: RequirementQuery) {
    const params = [
      input.category_id,
      input.section === 'details'
        ? DETAIL_TYPES
        : input.section === 'documents'
          ? DOCUMENT_TYPES
          : null,
      input.status === 'all' ? null : input.status === 'active',
      input.query,
    ];
    return this.database.transaction(async (tx) => {
      const meta = await tx.query<{ total: number }>(
        'SELECT count(*)::int AS total ' + requirementFilters,
        params,
      );
      const total = meta.rows[0]!.total;
      const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
      const result = await tx.query<Requirement & { category: Category }>(
        'SELECT r.*, to_jsonb(c) AS category ' +
          requirementFilters +
          ' ORDER BY c.sort_order,r.sort_order,r.label,r.id LIMIT 20 OFFSET $5',
        [...params, (page - 1) * 20],
      );
      const rows = result.rows.map((row) => ({
        ...row,
        category: {
          ...row.category,
          created_at: new Date(row.category.created_at),
          updated_at: new Date(row.category.updated_at),
        },
      }));
      return { rows, total, page, page_size: 20 };
    }, 'REPEATABLE READ');
  }

  async public_requirements() {
    const { rows } = await this.database.query<
      Requirement & {
        category: Pick<Category, 'id' | 'name' | 'description'>;
      }
    >(
      `SELECT r.*, jsonb_build_object('id',c.id,'name',c.name,'description',c.description) AS category
      FROM partner_requirements r JOIN requirement_categories c ON c.id=r.category_id
      WHERE r.is_active AND c.is_active ORDER BY c.sort_order,r.sort_order,r.label`,
    );
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

  private async lock(tx: SqlClient, actor: string) {
    await requireActiveAdmin(tx, actor);
    await tx.query('SELECT pg_advisory_xact_lock(720051)');
  }

  save_category(actor_id: string, input: CategoryInput, id?: string) {
    return this.database.transaction(async (tx) => {
      await this.lock(tx, actor_id);
      const before = id
        ? ((await tx.query<Category>(categoryById, [id])).rows[0] ?? null)
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
      const name = input.name.trim().replace(/\s+/g, ' ');
      if (before && !before.is_active && input.is_active) {
        const result = await tx.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM partner_requirements r
            JOIN requirement_categories c ON c.id=r.category_id
            WHERE r.is_active AND (c.is_active OR c.id=$1)`,
          [before.id],
        );
        if (result.rows[0]!.total > MAX_PARTNER_FIELDS)
          throw new AppError(
            422,
            'PARTNER_FIELD_LIMIT',
            'The partner form supports up to 200 active fields. Disable some fields before enabling this category.',
          );
      }
      const result = await tx.query<Category>(
        before ? updateCategory : insertCategory,
        [
          id ?? nextEntityId(),
          name,
          name.toLowerCase(),
          input.description,
          input.sort_order,
          input.is_active,
        ],
      );
      const row = result.rows[0]!;
      await insertUserLog(tx, {
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
    });
  }
  save_field(actor_id: string, input: RequirementInput, id?: string) {
    return this.database.transaction(async (tx) => {
      await this.lock(tx, actor_id);
      const before = id
        ? ((await tx.query<Requirement>(requirementById, [id])).rows[0] ?? null)
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
      const key =
        before && before.label !== input.label && before.key === input.key
          ? input.label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^[^a-z]+|_+$/g, '')
              .slice(0, 64)
          : input.key;
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(key))
        throw new AppError(
          422,
          'FIELD_KEY_INVALID',
          'Use a label that generates a valid field key, or provide a key of 2–64 lowercase letters, numbers and underscores.',
        );
      const duplicate = (
        await tx.query<{ id: string }>(
          'SELECT id FROM partner_requirements WHERE key=$1',
          [key],
        )
      ).rows[0];
      if (duplicate && duplicate.id !== id)
        throw new AppError(
          409,
          'FIELD_KEY_EXISTS',
          'Another requirement already uses this field key. Choose a distinct label or key.',
        );
      const category = (
        await tx.query<Category>(categoryById, [input.category_id])
      ).rows[0];
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
      const kind = input_kind({ ...input, key });
      if (
        (kind === 'DOB' && input.field_type !== 'DATE') ||
        (kind !== 'DOB' &&
          kind !== 'DEFAULT' &&
          !['STRING', 'TEXT'].includes(input.field_type))
      )
        throw new AppError(
          422,
          'FIELD_TYPE_INCOMPATIBLE',
          kind === 'DOB'
            ? 'Use the Date field type for date of birth.'
            : 'Use the String or Text field type for this selection or formatted identifier.',
        );
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
        const count = await tx.query<{ total: number }>(
          'SELECT count(*)::int AS total FROM partner_requirements r JOIN requirement_categories c ON c.id=r.category_id WHERE r.is_active AND c.is_active AND ($1::text IS NULL OR r.id<>$1)',
          [id],
        );
        const other_fields = count.rows[0]!.total;
        if (other_fields >= MAX_PARTNER_FIELDS)
          throw new AppError(
            422,
            'PARTNER_FIELD_LIMIT',
            'The partner form supports up to 200 active fields. Disable another field before adding this one.',
          );
      }
      const data = {
        category_id: input.category_id,
        key,
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
      const result = await tx.query<Requirement>(
        before ? updateRequirement : insertRequirement,
        [
          id ?? nextEntityId(),
          data.category_id,
          data.key,
          data.label,
          data.field_type,
          data.description,
          data.placeholder,
          data.is_required,
          data.is_active,
          data.sort_order,
          data.min_value,
          data.max_value,
          data.max_length,
          data.max_file_size_mb,
          data.allowed_extensions,
          data.allow_multiple,
        ],
      );
      const row = { ...result.rows[0]!, category };
      // A section revision includes changes to the fields it contains.
      await tx.query(touchCategories, [
        [input.category_id, before?.category_id ?? input.category_id],
      ]);
      await insertUserLog(tx, {
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
    });
  }
  remove(
    actor_id: string,
    id: string,
    expected_updated_at: string,
    category = false,
  ) {
    return this.database.transaction(async (tx) => {
      await this.lock(tx, actor_id);
      const before = category
        ? (await tx.query<Category>(categoryById, [id])).rows[0]
        : (await tx.query<Requirement>(requirementById, [id])).rows[0];
      if (!before)
        throw new AppError(
          404,
          'REQUIREMENT_NOT_FOUND',
          'This section or field no longer exists. Refresh the list.',
        );
      if (before.updated_at.toISOString() !== expected_updated_at)
        throw new AppError(
          409,
          'REQUIREMENT_CONFLICT',
          'This section or field changed. Refresh before deleting.',
        );
      let snapshot:
        Category | Requirement | (Category & { fields: Requirement[] }) =
        before;
      // Submitted applications retain their own immutable definition snapshots.
      if ('category_id' in before) {
        await tx.query('DELETE FROM partner_requirements WHERE id=$1', [id]);
        await tx.query(touchCategories, [[before.category_id]]);
      } else {
        const fields = await tx.query<Requirement>(
          'DELETE FROM partner_requirements WHERE category_id=$1 RETURNING *',
          [id],
        );
        snapshot = { ...before, fields: fields.rows };
        await tx.query('DELETE FROM requirement_categories WHERE id=$1', [id]);
      }
      await insertUserLog(tx, {
        actor_id,
        entity_type: category ? 'RequirementCategory' : 'PartnerRequirement',
        entity_id: id,
        action: category
          ? 'DELETE_REQUIREMENT_CATEGORY'
          : 'DELETE_PARTNER_REQUIREMENT',
        before_data: snapshot,
      });
      return { deleted: true, id };
    });
  }
}
