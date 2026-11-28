export const requirementFilters = `
  FROM partner_requirements r JOIN requirement_categories c ON c.id=r.category_id
  WHERE ($1::text IS NULL OR r.category_id=$1)
    AND ($2::text[] IS NULL OR r.field_type::text=ANY($2))
    AND ($3::boolean IS NULL OR r.is_active=$3)
    AND ($4::text='' OR r.label ILIKE '%'||$4||'%' OR r.key ILIKE '%'||$4||'%')`;

export const insertCategory = `
  INSERT INTO requirement_categories
    (id,name,normalized_name,description,sort_order,is_active,updated_at)
  VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp())
  RETURNING *`;

export const updateCategory = `
  UPDATE requirement_categories SET name=$2,normalized_name=$3,description=$4,sort_order=$5,is_active=$6,
    updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 ms')
  WHERE id=$1 RETURNING *`;

export const insertRequirement = `
  INSERT INTO partner_requirements
    (id,category_id,key,label,field_type,description,placeholder,is_required,is_active,sort_order,
      min_value,max_value,max_length,max_file_size_mb,allowed_extensions,allow_multiple,updated_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,clock_timestamp())
  RETURNING *`;

export const updateRequirement = `
  UPDATE partner_requirements SET category_id=$2,key=$3,label=$4,field_type=$5,description=$6,
    placeholder=$7,is_required=$8,is_active=$9,sort_order=$10,min_value=$11,max_value=$12,
    max_length=$13,max_file_size_mb=$14,allowed_extensions=$15,allow_multiple=$16,
    updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 ms')
  WHERE id=$1 RETURNING *`;

export const touchCategories = `
  UPDATE requirement_categories
  SET updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 ms') WHERE id=ANY($1::text[])`;
