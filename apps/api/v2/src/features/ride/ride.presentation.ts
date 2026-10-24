/** Public trip information shared by rider history and receipts. */
export const rider_driver_select = {
  id: true,
  user_id: true,
  rating_average: true,
  ratings_count: true,
  user: {
    select: { id: true, first_name: true, last_name: true, avatar_url: true },
  },
} as const;
export const rider_vehicle_select = {
  id: true,
  make: true,
  model: true,
  plate_number: true,
  color: true,
  type: true,
  capacity: true,
  photo_url: true,
} as const;
