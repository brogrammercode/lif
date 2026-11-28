import { Injectable } from '@nestjs/common';
import { AdminAccessReader } from './admin-access.reader.js';
import { AdminAccessRepository } from './admin_access.repo.js';
import type {
  AccessListInput,
  GrantAccessInput,
  RevokeAccessInput,
} from './admin_access.type.js';

@Injectable()
export class AdminAccessService {
  constructor(
    private readonly repository: AdminAccessRepository,
    private readonly reader: AdminAccessReader,
  ) {}

  list_access(input: AccessListInput) {
    return this.reader.list(input);
  }

  async grant_access(actor: string, input: GrantAccessInput) {
    const result = await this.repository.grant_access(actor, input);
    return { changed: result.changed, admin: result.user };
  }

  revoke_access(actor: string, user: string, input: RevokeAccessInput) {
    return this.repository.revoke_access(actor, user, input);
  }
}
