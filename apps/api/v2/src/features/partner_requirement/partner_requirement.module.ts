import { Module } from '@nestjs/common';
import { PartnerRequirementController } from './partner_requirement.controller.js';
import { PartnerRequirementRepository } from './partner_requirement.repo.js';
@Module({
  controllers: [PartnerRequirementController],
  providers: [PartnerRequirementRepository],
})
export class PartnerRequirementModule {}
