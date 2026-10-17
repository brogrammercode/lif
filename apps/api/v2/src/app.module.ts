import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import { AdminModule } from './features/admin/admin.module.js';
import { AdminAuthModule } from './features/admin_auth/admin_auth.module.js';
import { AdminUserModule } from './features/admin_user/admin_user.module.js';
import { AuthModule } from './features/auth/auth.module.js';
import { DriverModule } from './features/driver/driver.module.js';
import { EmergencyModule } from './features/emergency/emergency.module.js';
import { GeocodeModule } from './features/geocode/geocode.module.js';
import { HealthModule } from './features/health/health.module.js';
import { PaymentModule } from './features/payment/payment.module.js';
import { RideModule } from './features/ride/ride.module.js';
import { SupportModule } from './features/support/support.module.js';
import { UserModule } from './features/user/user.module.js';
import { VehicleCategoryModule } from './features/vehicle_category/vehicle_category.module.js';
@Module({
  imports: [
    CoreModule,
    HealthModule,
    AdminAuthModule,
    AdminUserModule,
    AdminModule,
    AuthModule,
    DriverModule,
    EmergencyModule,
    GeocodeModule,
    PaymentModule,
    RideModule,
    SupportModule,
    UserModule,
    VehicleCategoryModule,
  ],
})
export class AppModule {}
