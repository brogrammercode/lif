import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service.js';
@Injectable()
export class HealthService {
  constructor(private readonly database: PostgresService) {}
  async database_status(): Promise<boolean> {
    try {
      await this.database.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
