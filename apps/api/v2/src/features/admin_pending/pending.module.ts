import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { PendingController } from './pending.controller.js';
import { PendingRepository } from './pending.repository.js';
import { PendingService } from './pending.service.js';
import { RegistrationEmailController } from './registration_email.controller.js';
import { RegistrationEmailService } from './registration-email.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PendingController, RegistrationEmailController],
  providers: [PendingService, PendingRepository, RegistrationEmailService],
})
export class PendingModule {}
