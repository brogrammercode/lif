import { Module } from '@nestjs/common';
import { PartnerProgramService } from './partner_program.service.js';
import { PartnerDocumentService } from './partner_document.service.js';
import { PartnerDeliveryService } from './partner_delivery.service.js';
import {
  PartnerProgramController,
  AdminPartnerProgramController,
} from './partner_program.controller.js';
@Module({
  controllers: [PartnerProgramController, AdminPartnerProgramController],
  providers: [
    PartnerProgramService,
    PartnerDocumentService,
    PartnerDeliveryService,
  ],
})
export class PartnerProgramModule {}
