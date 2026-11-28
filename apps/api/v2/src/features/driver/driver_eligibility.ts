import {
  is_vehicle_eligible,
  type MatchingVehicle,
} from '../vehicle_category/vehicle_category.security.js';

type DriverAvailability =
  'OFFLINE' | 'AVAILABLE' | 'EN_ROUTE' | 'ON_TRIP' | 'PAUSED' | 'SUSPENDED';
type DriverForAvailability = {
  id: string;
  availability: DriverAvailability;
  verification_status: string;
  user: { status: string };
  active_vehicle: MatchingVehicle | null;
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
