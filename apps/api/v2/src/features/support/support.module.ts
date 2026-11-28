import { Module } from '@nestjs/common';
import { SupportController } from './support.controller.js';
import { SupportRepository } from './support.repository.js';
import { DatabaseModule } from '../../database/database.module.js';
import { SupportService } from './support.service.js';
@Module({
  imports: [DatabaseModule],
  controllers: [SupportController],
  providers: [SupportRepository, SupportService],
  exports: [SupportRepository, SupportService],
})
export class SupportModule {}
