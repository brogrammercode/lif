import { PendingModule } from './features/admin_pending/pending.controller.js';
import { DriverOperationsModule } from './features/driver_operations/driver_operations.module.js';
import { Module } from '@nestjs/common';
import { PlacesModule } from './features/places/places.module.js';
import { DriverAccountModule } from './features/driver_account/driver_account.module.js';
import { AppConfigurationModule } from './features/app_configuration/app_configuration.module.js';
import { TravelContextModule } from './features/travel_context/travel_context.module.js';
import { VehicleVerificationModule } from './features/vehicle_verification/vehicle_verification.module.js';
import { PartnerProgramModule } from './features/partner_program/partner_program.module.js';
import { VehicleCatalogModule } from './features/vehicle_catalog/vehicle_catalog.module.js';
import { PartnerRequirementModule } from './features/partner_requirement/partner_requirement.module.js';
import { CoreModule } from './core/core.module.js';
import { AdminAccessModule } from './features/admin_access/admin_access.module.js';
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
    PlacesModule,
    PendingModule,
    DriverAccountModule,
    DriverOperationsModule,
    AppConfigurationModule,
    TravelContextModule,
    VehicleVerificationModule,
    PartnerProgramModule,
    VehicleCatalogModule,
    PartnerRequirementModule,
    CoreModule,
    AdminAccessModule,
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
