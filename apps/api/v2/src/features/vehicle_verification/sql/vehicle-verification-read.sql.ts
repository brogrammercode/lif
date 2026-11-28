import {
  matchingJoins,
  matchingVehicleProjection,
} from '../../driver/sql/driver-profile.sql.js';

export const verificationOwner = `SELECT id,first_name,last_name,email,avatar_url,status,role,partner_activated_at
  FROM users WHERE id=$1 AND deleted_at IS NULL`;

export const verificationVehicles = `SELECT ${matchingVehicleProjection(true)} AS vehicle
  FROM vehicles v JOIN driver_profiles p ON p.id=v.driver_id
  ${matchingJoins} WHERE p.user_id=$1 ORDER BY v.created_at DESC,v.id ASC`;

export const verificationVehicleById = `SELECT ${matchingVehicleProjection(true)} AS vehicle
  FROM vehicles v ${matchingJoins} WHERE v.id=$1`;

export const verificationCategory = `SELECT c.id,c.name,c.is_active,c.vehicle_type,c.capacity,
  CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('name',p.name,'is_active',p.is_active) END AS parent,
  jsonb_build_object('children',(SELECT count(*) FROM vehicle_categories WHERE parent_id=c.id)) AS _count
  FROM vehicle_categories c LEFT JOIN vehicle_categories p ON p.id=c.parent_id WHERE c.id=$1`;

export const pendingVerificationAssets = `SELECT id,field_key,created_at FROM vehicle_verification_assets
  WHERE owner_id=$1 AND vehicle_id IS NULL AND created_at >= $2`;

export const readVerificationAsset = `SELECT a.file_name,a.bytes
  FROM vehicle_verification_assets a JOIN users u ON u.id=$1
  WHERE a.id=$2 AND u.status='ACTIVE' AND u.deleted_at IS NULL
    AND (a.owner_id=u.id OR (u.role='ADMIN' AND a.vehicle_id IS NOT NULL))`;

const allowed = (alias: 'b' | 'm') =>
  `${alias}.is_active AND (${alias}.status='VERIFIED'
    OR (${alias}.status='REQUESTED' AND ${alias}.requested_by_id=$1))`;

export const verificationBrandFields =
  'b.id,b.name,b.description,b.country,b.website_url,b.logo_url,b.status';
export const verificationModelFields = `m.id,m.brand_id,m.name,m.description,m.logo_url,m.status,
  m.vehicle_type,m.fuel_type,m.seating_capacity,m.year_from,m.year_to`;
export const verificationBrandFilter = `FROM vehicle_brands b WHERE ${allowed('b')}
  AND ($2='' OR strpos(lower(b.name),lower($2))>0)`;
export const verificationModelFilter = `FROM vehicle_models m JOIN vehicle_brands b ON b.id=m.brand_id
  WHERE m.brand_id=$3 AND ${allowed('b')} AND ${allowed('m')}
    AND ($2='' OR strpos(lower(m.name),lower($2))>0)`;
