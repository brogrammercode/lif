import { Module } from '@nestjs/common';
import { VehicleVerificationController } from './vehicle_verification.controller.js';
import { VehicleVerificationService } from './vehicle_verification.service.js';
import { DatabaseModule } from '../../database/database.module.js';
@Module({
  imports: [DatabaseModule],
  controllers: [VehicleVerificationController],
  providers: [VehicleVerificationService],
})
export class VehicleVerificationModule {}
