import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller.js';
import { PaymentRepository } from './payment.repo.js';
import { PaymentService } from './payment.service.js';
@Module({
  imports: [],
  controllers: [PaymentController],
  providers: [PaymentRepository, PaymentService],
  exports: [PaymentRepository, PaymentService],
})
export class PaymentModule {}
