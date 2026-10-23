import { Module } from '@nestjs/common';
import { VehicleVerificationController } from './vehicle_verification.controller.js';
import { VehicleVerificationService } from './vehicle_verification.service.js';
@Module({
  controllers: [VehicleVerificationController],
  providers: [VehicleVerificationService],
})
export class VehicleVerificationModule {}
