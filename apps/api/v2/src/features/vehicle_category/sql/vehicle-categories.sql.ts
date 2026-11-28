export const selectCategory = `
  SELECT c.*,
    to_jsonb(p) AS parent,
    jsonb_build_object(
      'children', (SELECT count(*) FROM vehicle_categories WHERE parent_id=c.id),
      'vehicles', (SELECT count(*) FROM vehicles WHERE vehicle_category_id=c.id),
      'quotes', (SELECT count(*) FROM fare_quotes WHERE vehicle_category_id=c.id)
    ) AS "_count"
  FROM vehicle_categories c
  LEFT JOIN vehicle_categories p ON p.id=c.parent_id`;

export const insertCategory = `
  INSERT INTO vehicle_categories (id, code, name, description, image_url, parent_id,
    vehicle_type, capacity, base_fare, per_kilometer, per_minute, is_active, sort_order,
    max_profit_km, normal_fare_per_km, profit_fare_per_km, commission_percent, updated_at)
  VALUES ($17, $18, $1, $2, $3, $4, $5, $6, COALESCE($7::numeric,0), COALESCE($8::numeric,0),
    COALESCE($9::numeric,0), $10, $11,
    CASE WHEN $12::boolean THEN $13::numeric END,
    CASE WHEN $12 THEN $14::numeric END, CASE WHEN $12 THEN $15::numeric END,
    COALESCE($16::numeric,0), $19)`;

export const updateCategory = `
  UPDATE vehicle_categories SET name=$1, description=$2, image_url=$3, parent_id=$4,
    vehicle_type=$5, capacity=$6, base_fare=COALESCE($7,base_fare),
    per_kilometer=COALESCE($8,per_kilometer), per_minute=COALESCE($9,per_minute),
    is_active=$10, sort_order=$11,
    max_profit_km=CASE WHEN $12::boolean THEN $13 ELSE max_profit_km END,
    normal_fare_per_km=CASE WHEN $12 THEN $14 ELSE normal_fare_per_km END,
    profit_fare_per_km=CASE WHEN $12 THEN $15 ELSE profit_fare_per_km END,
    commission_percent=COALESCE($16,commission_percent), updated_at=$18
  WHERE id=$17`;
