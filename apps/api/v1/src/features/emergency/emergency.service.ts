import { AppError } from '../../core/error.js';
import { EMERGENCY_CONTACT_NOT_FOUND_MESSAGE } from './emergency.constant.js';
import { create_contact, delete_contact, list_contacts, update_contact } from './emergency.repo.js';
import type { EmergencyContactInput } from './emergency.type.js';

export const get_emergency_contacts = (user_id: string) => list_contacts(user_id);
export const add_emergency_contact = (user_id: string, input: EmergencyContactInput) => create_contact(user_id, input);
export const edit_emergency_contact = async (user_id: string, contact_id: string, input: EmergencyContactInput) => {
  const contact = await update_contact(user_id, contact_id, input);
  if (!contact) throw new AppError(404, 'EMERGENCY_CONTACT_NOT_FOUND', EMERGENCY_CONTACT_NOT_FOUND_MESSAGE);
  return contact;
};
export const remove_emergency_contact = async (user_id: string, contact_id: string) => {
  if (!(await delete_contact(user_id, contact_id))) throw new AppError(404, 'EMERGENCY_CONTACT_NOT_FOUND', EMERGENCY_CONTACT_NOT_FOUND_MESSAGE);
};
