export const saveFarePolicy = `
  INSERT INTO ride_fare_policies
    (id, key, updated_by_id, updated_at, arrival_radius_m, location_max_age_s,
      matching_initial_radius_km, matching_max_radius_km, matching_expansion_s,
      search_timeout_s, offer_lifetime_s, cash_enabled, direct_upi_enabled,
      online_payment_enabled, commission_percent, free_cancellation_minutes,
      free_pickup_wait_minutes, cancellation_fee_percent, maximum_cancellation_fee)
  VALUES ($1,$2,$3,clock_timestamp(),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
  ON CONFLICT (key) DO UPDATE SET
    updated_by_id=EXCLUDED.updated_by_id, updated_at=EXCLUDED.updated_at,
    version=ride_fare_policies.version+1,
    arrival_radius_m=EXCLUDED.arrival_radius_m, location_max_age_s=EXCLUDED.location_max_age_s,
    matching_initial_radius_km=EXCLUDED.matching_initial_radius_km,
    matching_max_radius_km=EXCLUDED.matching_max_radius_km,
    matching_expansion_s=EXCLUDED.matching_expansion_s, search_timeout_s=EXCLUDED.search_timeout_s,
    offer_lifetime_s=EXCLUDED.offer_lifetime_s, cash_enabled=EXCLUDED.cash_enabled,
    direct_upi_enabled=EXCLUDED.direct_upi_enabled, online_payment_enabled=EXCLUDED.online_payment_enabled,
    commission_percent=EXCLUDED.commission_percent,
    free_cancellation_minutes=EXCLUDED.free_cancellation_minutes,
    free_pickup_wait_minutes=EXCLUDED.free_pickup_wait_minutes,
    cancellation_fee_percent=EXCLUDED.cancellation_fee_percent,
    maximum_cancellation_fee=EXCLUDED.maximum_cancellation_fee
  WHERE ride_fare_policies.version=$19
  RETURNING *`;

export const saveCategoryFare = `
  UPDATE vehicle_categories SET max_profit_km=$1, normal_fare_per_km=$2,
    profit_fare_per_km=$3, commission_percent=COALESCE($4,commission_percent), updated_at=$5
  WHERE id=$6 AND updated_at=$7`;

export const saveSupportContacts = `
  INSERT INTO support_contact_configurations
    (id, key, updated_by_id, updated_at, support_phone, emergency_phone,
       whatsapp_phone, support_email, support_hours, instructions)
  VALUES ($1,$2,$3,clock_timestamp(),$4,$5,$6,$7,$8,$9)
  ON CONFLICT (key) DO UPDATE SET
    updated_by_id=EXCLUDED.updated_by_id, updated_at=EXCLUDED.updated_at,
    version=support_contact_configurations.version+1,
    support_phone=EXCLUDED.support_phone, emergency_phone=EXCLUDED.emergency_phone,
    whatsapp_phone=EXCLUDED.whatsapp_phone, support_email=EXCLUDED.support_email,
    support_hours=EXCLUDED.support_hours, instructions=EXCLUDED.instructions
  WHERE support_contact_configurations.version=$10
  RETURNING *`;
