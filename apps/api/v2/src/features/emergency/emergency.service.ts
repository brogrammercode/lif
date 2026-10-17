import { Injectable } from '@nestjs/common';
import { EmergencyRepository } from './emergency.repo.js';
import { AppError } from '../../core/error.js';
import { EMERGENCY_CONTACT_NOT_FOUND_MESSAGE } from './emergency.constant.js';
import type { EmergencyContactInput } from './emergency.type.js';
@Injectable()
export class EmergencyService {
  constructor(private readonly emergencyRepository: EmergencyRepository) {}
  readonly get_emergency_contacts = (user_id: string) =>
    this.emergencyRepository.list_contacts(user_id);

  readonly add_emergency_contact = (
    user_id: string,
    input: EmergencyContactInput,
  ) => this.emergencyRepository.create_contact(user_id, input);

  readonly edit_emergency_contact = async (
    user_id: string,
    contact_id: string,
    input: EmergencyContactInput,
  ) => {
    const contact = await this.emergencyRepository.update_contact(
      user_id,
      contact_id,
      input,
    );
    if (!contact)
      throw new AppError(
        404,
        'EMERGENCY_CONTACT_NOT_FOUND',
        EMERGENCY_CONTACT_NOT_FOUND_MESSAGE,
      );
    return contact;
  };

  readonly remove_emergency_contact = async (
    user_id: string,
    contact_id: string,
  ) => {
    if (!(await this.emergencyRepository.delete_contact(user_id, contact_id)))
      throw new AppError(
        404,
        'EMERGENCY_CONTACT_NOT_FOUND',
        EMERGENCY_CONTACT_NOT_FOUND_MESSAGE,
      );
  };
}
