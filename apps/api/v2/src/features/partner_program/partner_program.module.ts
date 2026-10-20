import { Module } from '@nestjs/common';
import { PartnerExitService } from './partner_exit.service.js';
import {
  PartnerExitController,
  AdminPartnerExitController,
} from './partner_exit.controller.js';
import { PartnerProgramService } from './partner_program.service.js';
import { PartnerDocumentService } from './partner_document.service.js';
import { PartnerDeliveryService } from './partner_delivery.service.js';
import {
  PartnerProgramController,
  AdminPartnerProgramController,
} from './partner_program.controller.js';
@Module({
  controllers: [
    PartnerProgramController,
    AdminPartnerProgramController,
    PartnerExitController,
    AdminPartnerExitController,
  ],
  providers: [
    PartnerProgramService,
    PartnerDocumentService,
    PartnerDeliveryService,
    PartnerExitService,
  ],
})
export class PartnerProgramModule {}
