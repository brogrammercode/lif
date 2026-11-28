import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from './configuration.repository.js';
import type {
  FarePolicyInput,
  SupportContactInput,
} from './app_configuration.type.js';

@Injectable()
export class AppConfigurationService {
  constructor(private readonly configuration: ConfigurationRepository) {}

  fare_snapshot() {
    return this.configuration.fareSnapshot();
  }

  fare_policy() {
    return this.configuration.readFares();
  }

  save_fare_policy(actorId: string, input: FarePolicyInput) {
    return this.configuration.saveFares(actorId, input);
  }

  support_contacts(admin = false) {
    return this.configuration.readContacts(admin);
  }

  save_support_contacts(actorId: string, input: SupportContactInput) {
    return this.configuration.saveContacts(actorId, input);
  }
}
