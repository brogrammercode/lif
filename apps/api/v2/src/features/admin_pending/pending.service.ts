import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { pending_query } from './pending.rules.js';
import { PendingRepository } from './pending.repository.js';

@Injectable()
export class PendingService {
  constructor(private readonly repository: PendingRepository) {}
  async counts(input: z.infer<typeof pending_query>) {
    const snapshot = await this.repository.snapshot();
    const users: Record<string, { vehicle_verification: number }> = {};
    const applications: Record<
      string,
      { fields: number; confirmations: number }
    > = {};
    if (input.user_ids.length) {
      for (const id of input.user_ids) users[id] = { vehicle_verification: 0 };
      for (const row of await this.repository.users(input.user_ids))
        users[row.id] = { vehicle_verification: row.count };
    }
    if (input.application_ids.length) {
      for (const row of await this.repository.applications(
        input.application_ids,
      ))
        applications[row.id] = {
          fields: row.fields,
          confirmations: row.confirmations,
        };
    }
    const tabs = {
      vehicle_models: snapshot.brands + snapshot.models,
      vehicle_verification: snapshot.vehicles,
      applications: snapshot.applications,
      confirmations: snapshot.confirmations,
      exit_requests: snapshot.exits,
      ride_reviews: snapshot.reviews,
      registration_emails: snapshot.signup_emails,
    };
    const sections = {
      app: tabs.vehicle_models + tabs.ride_reviews,
      users: tabs.vehicle_verification,
      partner_program:
        tabs.applications + tabs.confirmations + tabs.exit_requests,
      admin: snapshot.signup_emails,
      support: 0,
    };
    return {
      total: Object.values(sections).reduce((a, b) => a + b, 0),
      sections,
      tabs,
      queues: {
        brands: snapshot.brands,
        models: snapshot.models,
        email_failures: snapshot.email_failures,
        activation_locked: snapshot.activation_locked,
      },
      entities: { users, applications },
    };
  }
}
