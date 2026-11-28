import { Injectable } from '@nestjs/common';
import { nextEntityId } from '../../database/entity-id.js';
import { PostgresService } from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import type { EmergencyContactInput } from './dto/emergency-contact.dto.js';
import { emergencySql } from './sql/emergency.sql.js';

type EmergencyContact = {
  id: string;
  user_id: string;
  name: string;
  phone_e164: string;
  relationship: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class EmergencyRepository {
  constructor(private readonly database: PostgresService) {}

  async list_contacts(user_id: string) {
    const { rows } = await this.database.query<EmergencyContact>(
      emergencySql.list,
      [user_id],
    );
    return rows;
  }

  async create_contact(user_id: string, input: EmergencyContactInput) {
    return this.database.transaction(async (tx) => {
      const { rows } = await tx.query<EmergencyContact>(emergencySql.create, [
        nextEntityId(),
        user_id,
        input.name,
        input.phone_e164,
        input.relationship,
      ]);
      const contact = rows[0]!;
      await insertUserLog(tx, {
        actor_id: user_id,
        entity_type: 'EmergencyContact',
        entity_id: contact.id,
        action: 'CREATE_EMERGENCY_CONTACT',
        after_data: contact,
      });
      return contact;
    });
  }

  async update_contact(
    user_id: string,
    contact_id: string,
    input: EmergencyContactInput,
  ) {
    return this.database.transaction(async (tx) => {
      const { rows: before } = await tx.query<EmergencyContact>(
        emergencySql.lock,
        [contact_id, user_id],
      );
      if (!before[0]) return null;
      const { rows } = await tx.query<EmergencyContact>(emergencySql.update, [
        contact_id,
        user_id,
        input.name,
        input.phone_e164,
        input.relationship,
      ]);
      const contact = rows[0]!;
      await insertUserLog(tx, {
        actor_id: user_id,
        entity_type: 'EmergencyContact',
        entity_id: contact.id,
        action: 'UPDATE_EMERGENCY_CONTACT',
        before_data: before[0],
        after_data: contact,
      });
      return contact;
    });
  }

  async delete_contact(user_id: string, contact_id: string) {
    return this.database.transaction(async (tx) => {
      const { rows } = await tx.query<EmergencyContact>(emergencySql.delete, [
        contact_id,
        user_id,
      ]);
      if (!rows[0]) return false;
      await insertUserLog(tx, {
        actor_id: user_id,
        entity_type: 'EmergencyContact',
        entity_id: rows[0].id,
        action: 'DELETE_EMERGENCY_CONTACT',
        before_data: rows[0],
      });
      return true;
    });
  }
}
