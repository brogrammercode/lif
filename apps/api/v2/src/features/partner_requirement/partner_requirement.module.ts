import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { PartnerRequirementController } from './partner_requirement.controller.js';
import { PartnerRequirementRepository } from './partner_requirement.repo.js';
@Module({
  imports: [DatabaseModule],
  controllers: [PartnerRequirementController],
  providers: [PartnerRequirementRepository],
})
export class PartnerRequirementModule {}
