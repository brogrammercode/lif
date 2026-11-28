const person = (
  alias: 'requester' | 'reviewer',
) => `CASE WHEN ${alias}.id IS NOT NULL THEN
  jsonb_build_object('id',${alias}.id,'email',${alias}.email,'first_name',${alias}.first_name,'last_name',${alias}.last_name) END`;
export const people = `${person('requester')} AS requested_by,${person('reviewer')} AS reviewed_by`;
export const peopleJoins = `LEFT JOIN users requester ON requester.id=c.requested_by_id
  LEFT JOIN users reviewer ON reviewer.id=c.reviewed_by_id`;
export const brandFilter = `WHERE (($1::boolean AND c.status='VERIFIED' AND c.is_active)
    OR (NOT $1 AND ($2::text='all' OR c.status::text=$2)))
    AND ($3::text='' OR c.name ILIKE '%'||$3||'%')`;
export const modelFilter = `WHERE (($1::boolean AND c.status='VERIFIED' AND c.is_active AND b.status='VERIFIED' AND b.is_active)
    OR (NOT $1 AND ($2::text='all' OR c.status::text=$2)))
    AND ($3::text='' OR c.name ILIKE '%'||$3||'%') AND ($4::text IS NULL OR c.brand_id=$4)`;
export const brandIdentity = `jsonb_build_object('id',b.id,'name',b.name)`;
export const brandSummary = `jsonb_build_object('id',b.id,'name',b.name,
  'status',b.status,'is_active',b.is_active,'logo_url',b.logo_url)`;
export const insertBrand = `INSERT INTO vehicle_brands (id,name,normalized_name,description,country,website_url,
  logo_url,status,is_active,rejection_reason,requested_by_id,reviewed_by_id,reviewed_at,updated_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,clock_timestamp())`;
export const updateBrand = `UPDATE vehicle_brands SET name=$2,normalized_name=$3,description=$4,country=$5,
  website_url=$6,logo_url=$7,status=$8,is_active=$9,rejection_reason=$10,requested_by_id=$11,
  reviewed_by_id=$12,reviewed_at=$13,
  updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 ms') WHERE id=$1`;
export const insertModel = `INSERT INTO vehicle_models (id,brand_id,name,normalized_name,description,
  logo_url,vehicle_type,fuel_type,seating_capacity,year_from,year_to,status,is_active,
  rejection_reason,requested_by_id,reviewed_by_id,reviewed_at,updated_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,clock_timestamp())`;
export const updateModel = `UPDATE vehicle_models SET brand_id=$2,name=$3,normalized_name=$4,description=$5,
  logo_url=$6,vehicle_type=$7,fuel_type=$8,seating_capacity=$9,year_from=$10,year_to=$11,status=$12,
  is_active=$13,rejection_reason=$14,requested_by_id=$15,reviewed_by_id=$16,reviewed_at=$17,
  updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 ms') WHERE id=$1`;
