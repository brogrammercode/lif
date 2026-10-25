import {
  fare_snapshot,
  read_category_fares,
  save_category_fares,
} from './category_fare_policy.js';
import type { SupportContactConfiguration } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import {
  CONFIGURATION_KEY,
  SUPPORT_CONFIGURATION_LOCK,
  type FarePolicyInput,
  type SupportContactInput,
} from './app_configuration.type.js';

const options = { maxWait: 10000, timeout: 30000 };
@Injectable()
export class AppConfigurationService {
  constructor(private readonly database: PrismaService) {}

  async fare_snapshot() {
    return fare_snapshot(this.database);
  }
  async fare_policy() {
    return read_category_fares(this.database);
  }
  async save_fare_policy(actor_id: string, input: FarePolicyInput) {
    return save_category_fares(this.database, actor_id, input);
  }

  async support_contacts(admin = false) {
    const row =
      await this.database.client.supportContactConfiguration.findUnique({
        where: { key: CONFIGURATION_KEY },
      });
    return this.present_support_contacts(row, admin);
  }

  private async present_support_contacts(
    row: SupportContactConfiguration | null,
    admin: boolean,
  ) {
    const updated_by =
      admin && row
        ? await this.database.client.user.findUnique({
            where: { id: row.updated_by_id },
            select: { id: true, first_name: true, last_name: true },
          })
        : undefined;
    return {
      version: row?.version ?? 0,
      updated_at: row?.updated_at ?? null,
      ...(admin ? { updated_by: updated_by ?? null } : {}),
      support_phone: row?.support_phone ?? null,
      emergency_phone: row?.emergency_phone ?? null,
      whatsapp_phone: row?.whatsapp_phone ?? null,
      support_email: row?.support_email ?? null,
      support_hours: row?.support_hours ?? null,
      instructions: row?.instructions ?? null,
    };
  }

  async save_support_contacts(actor_id: string, input: SupportContactInput) {
    const saved = await this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPPORT_CONFIGURATION_LOCK}::integer)`;
      const before = await tx.supportContactConfiguration.findUnique({
        where: { key: CONFIGURATION_KEY },
      });
      if ((before?.version ?? 0) !== input.expected_version)
        throw new AppError(
          409,
          'SUPPORT_CONFIGURATION_CONFLICT',
          'Support contacts changed. Reload before saving.',
        );
      const { expected_version: _, ...values } = input;
      const data = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          value?.trim() || null,
        ]),
      ) as Omit<SupportContactInput, 'expected_version'>;
      const row = before
        ? await tx.supportContactConfiguration.update({
            where: { id: before.id },
            data: {
              ...data,
              version: { increment: 1 },
              updated_by_id: actor_id,
            },
          })
        : await tx.supportContactConfiguration.create({
            data: { ...data, key: CONFIGURATION_KEY, updated_by_id: actor_id },
          });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'SupportContactConfiguration',
        entity_id: row.id,
        action: 'SAVE_SUPPORT_CONTACTS',
        before_data: before,
        after_data: row,
      });
      return row;
    }, options);
    return this.present_support_contacts(saved, true);
  }
}
