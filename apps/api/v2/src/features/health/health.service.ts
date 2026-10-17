import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
@Injectable()
export class HealthService {
  constructor(private readonly database: PrismaService) {}
  async database_status(): Promise<boolean> {
    try {
      await this.database.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
