import { Controller, Get, Header } from '@nestjs/common';
import { AuditRetentionService } from './audit_retention.service.js';

@Controller('internal/audit-retention')
export class AuditRetentionController {
  constructor(private readonly retention: AuditRetentionService) {}
  // Public by request. The caller cannot change the seven-day retention window
  // or select records; every invocation uses the bounded cleanup service.
  @Get()
  @Header('Cache-Control', 'no-store')
  async cleanup() {
    return {
      status: 'success',
      data: await this.retention.prune(),
      message: 'Expired audit logs cleared',
    };
  }
}
