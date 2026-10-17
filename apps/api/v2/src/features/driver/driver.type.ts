import { z } from 'zod';
export const driver_profile_schema = z.object({
  license_number: z.string().trim().min(3).max(80),
});
export const availability_schema = z
  .object({
    availability: z.enum(['OFFLINE', 'AVAILABLE', 'PAUSED']),
    latitude: z.number().gte(-90).lte(90).optional(),
    longitude: z.number().gte(-180).lte(180).optional(),
  })
  .strict()
  .refine(
    (input) =>
      (input.latitude === undefined) === (input.longitude === undefined),
    { message: 'Provide both latitude and longitude.', path: ['latitude'] },
  );
export const vehicle_schema = z
  .object({
    type: z.enum(['BIKE', 'SCOOTER', 'AUTO', 'SEDAN', 'SUV']).optional(),
    vehicle_category_id: z.string().min(1).max(100).optional(),
    make: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(80),
    color: z.string().trim().max(40).optional(),
    plate_number: z.string().trim().min(3).max(30),
    capacity: z.number().int().min(1).max(8).optional(),
    photo_url: z.string().url().optional(),
  })
  .strict()
  .refine((input) => input.vehicle_category_id || input.type, {
    message: 'Choose a vehicle category',
    path: ['vehicle_category_id'],
  });
export const vehicle_category_selection_schema = z
  .object({ vehicle_category_id: z.string().min(1).max(100) })
  .strict();
export const location_schema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  heading: z.number().min(0).max(360).optional(),
  speed_kph: z.number().min(0).max(500).optional(),
});
export type DriverProfileInput = z.infer<typeof driver_profile_schema>;
export type AvailabilityInput = z.infer<typeof availability_schema>;
export type VehicleInput = z.infer<typeof vehicle_schema>;
export type LocationInput = z.infer<typeof location_schema>;
