const identity = `CASE WHEN u.status='ACTIVE' THEN jsonb_build_object(
  'id',u.id,'first_name',u.first_name,'last_name',u.last_name,'avatar_url',u.avatar_url)
  ELSE jsonb_build_object('first_name','Former member') END`;
export const placeWhere = `
  FROM community_places c WHERE c.archived_at IS NULL
    AND ($2::text <> 'saved' OR EXISTS (SELECT 1 FROM saved_places s WHERE s.community_place_id=c.id AND s.user_id=$1))
    AND ($2 <> 'visited' OR EXISTS (SELECT 1 FROM place_visits v WHERE v.place_id=c.id AND v.user_id=$1))
    AND ($3::text IS NULL OR c.place_type=$3)
    AND ($4::text='' OR c.name ILIKE '%'||$4||'%' OR c.address ILIKE '%'||$4||'%')
    AND ($5::text IS NULL OR c.id=$5)`;
export const placeRows = `SELECT c.id,c.created_by_id,c.name,c.address,
  trim_scale(c.latitude)::text AS latitude,trim_scale(c.longitude)::text AS longitude,
  c.place_type,c.description,c.phone,c.website,c.version,c.created_at,c.updated_at,
  EXISTS (SELECT 1 FROM saved_places s WHERE s.community_place_id=c.id AND s.user_id=$1) AS saved,
  (SELECT visited_at FROM place_visits v WHERE v.place_id=c.id AND v.user_id=$1) AS visited_at,
  (SELECT count(*)::int FROM place_visits v WHERE v.place_id=c.id) AS visitor_count,
  (SELECT count(*)::int FROM place_reviews r WHERE r.place_id=c.id) AS review_count,
  (SELECT avg(score)::double precision FROM place_reviews r WHERE r.place_id=c.id) AS rating,
  COALESCE((SELECT jsonb_agg(to_jsonb(p)-'created_at' ORDER BY p.created_at,p.id) FROM (
    SELECT id,url,author_id,created_at FROM place_photos WHERE place_id=c.id ORDER BY created_at,id LIMIT $6
  ) p),'[]'::jsonb) AS photos,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'visited_at',to_char(v.visited_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'user',${identity})
    ORDER BY v.visited_at DESC,v.id DESC) FROM (
    SELECT id,user_id,visited_at FROM place_visits WHERE place_id=c.id ORDER BY visited_at DESC,id DESC LIMIT 3
  ) v LEFT JOIN users u ON u.id=v.user_id),'[]'::jsonb) AS visitors
  ${placeWhere} ORDER BY c.created_at DESC,c.id DESC LIMIT $7 OFFSET $8`;
export const reviewRows = `SELECT r.*,${identity} AS user FROM place_reviews r
  JOIN users u ON u.id=r.user_id WHERE r.place_id=$1
  ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET $2`;
export const insertBookmark = `INSERT INTO saved_places
  (id,user_id,community_place_id,label,address,latitude,longitude,place_type,updated_at)
  SELECT $1,$2,id,name,address,latitude,longitude,place_type,clock_timestamp()
  FROM community_places WHERE id=$3 AND archived_at IS NULL
  ON CONFLICT (user_id,community_place_id) DO NOTHING`;
