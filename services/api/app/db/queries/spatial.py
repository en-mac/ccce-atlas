"""
Spatial queries for PostGIS database.
"""

# Find POIs within radius of a point
POIS_NEAR_POINT = """
SELECT
    id,
    poi_id,
    name,
    category,
    subcategory,
    address,
    ST_AsGeoJSON(geom)::json as geometry,
    ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
    ) as distance_meters
FROM pois
WHERE ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
    $3
)
ORDER BY distance_meters
LIMIT $4
"""

# Find POIs within radius of a point, filtered by category
POIS_NEAR_POINT_BY_CATEGORY = """
SELECT
    id,
    poi_id,
    name,
    category,
    subcategory,
    address,
    ST_AsGeoJSON(geom)::json as geometry,
    ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
    ) as distance_meters
FROM pois
WHERE ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
    $3
)
AND category = $5
ORDER BY distance_meters
LIMIT $4
"""

# Find POIs at a point (within 10 meters)
POIS_AT_POINT = """
SELECT
    id,
    poi_id,
    name,
    category,
    subcategory,
    description,
    address,
    phone,
    website,
    hours,
    ST_AsGeoJSON(geom)::json as geometry,
    ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
    ) as distance_meters
FROM pois
WHERE ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
    10
)
ORDER BY distance_meters
LIMIT 5
"""
