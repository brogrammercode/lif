import type {
  DriverAvailability,
  Prisma,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';
import {
  is_vehicle_eligible,
  MATCHING_VEHICLE_INCLUDE,
} from '../vehicle_category/vehicle_category.security.js';

type DriverForAvailability = {
  id: string;
  availability: DriverAvailability;
  verification_status: VerificationStatus;
  user: { status: UserStatus };
  active_vehicle: Prisma.VehicleGetPayload<{
    include: typeof MATCHING_VEHICLE_INCLUDE;
  }> | null;
};

/** Cancellation and completion must apply the same current eligibility rules. */
export const availability_after_trip = (
  profile: DriverForAvailability,
): DriverAvailability => {
  if (profile.availability === 'SUSPENDED') return 'SUSPENDED';
  const category = profile.active_vehicle?.vehicle_category;
  return profile.verification_status === 'VERIFIED' &&
    profile.user.status === 'ACTIVE' &&
    category &&
    is_vehicle_eligible(
      profile.active_vehicle,
      {
        vehicle_category_id: category.id,
        vehicle_type: category.vehicle_type,
        category_snapshot: null,
      },
      profile.id,
    )
    ? 'AVAILABLE'
    : 'OFFLINE';
};
