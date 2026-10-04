import { Prisma } from '@prisma/client';
import { prisma } from '../../infra/database/client.js';
import { create_user_log } from '../../infra/database/user_log.js';
import type { EmergencyContactInput } from './emergency.type.js';

export const list_contacts = (user_id: string) => prisma.emergencyContact.findMany({ where: { user_id }, orderBy: { created_at: 'asc' } });

export const create_contact = async (user_id: string, input: EmergencyContactInput) =>
  prisma.$transaction(async (tx) => {
    const contact = await tx.emergencyContact.create({ data: { user_id, ...input } });
    await create_user_log(tx, { actor_id: user_id, entity_type: 'EmergencyContact', entity_id: contact.id, action: 'CREATE_EMERGENCY_CONTACT', after_data: contact as unknown as Prisma.InputJsonObject });
    return contact;
  });

export const update_contact = async (user_id: string, contact_id: string, input: EmergencyContactInput) =>
  prisma.$transaction(async (tx) => {
    const before = await tx.emergencyContact.findFirst({ where: { id: contact_id, user_id } });
    if (!before) return null;
    const contact = await tx.emergencyContact.update({ where: { id: contact_id }, data: input });
    await create_user_log(tx, { actor_id: user_id, entity_type: 'EmergencyContact', entity_id: contact_id, action: 'UPDATE_EMERGENCY_CONTACT', before_data: before as unknown as Prisma.InputJsonObject, after_data: contact as unknown as Prisma.InputJsonObject });
    return contact;
  });

export const delete_contact = async (user_id: string, contact_id: string) =>
  prisma.$transaction(async (tx) => {
    const before = await tx.emergencyContact.findFirst({ where: { id: contact_id, user_id } });
    if (!before) return false;
    await tx.emergencyContact.delete({ where: { id: contact_id } });
    await create_user_log(tx, { actor_id: user_id, entity_type: 'EmergencyContact', entity_id: contact_id, action: 'DELETE_EMERGENCY_CONTACT', before_data: before as unknown as Prisma.InputJsonObject });
    return true;
  });
