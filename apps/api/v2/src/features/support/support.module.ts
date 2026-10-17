import { Module } from '@nestjs/common';
import { SupportController } from './support.controller.js';
import { SupportRepository } from './support.repo.js';
import { SupportService } from './support.service.js';
@Module({
  imports: [],
  controllers: [SupportController],
  providers: [SupportRepository, SupportService],
  exports: [SupportRepository, SupportService],
})
export class SupportModule {}
