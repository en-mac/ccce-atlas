"""
Spatial queries for PostGIS database.
"""

# Find parcels within radius of a point
PARCELS_NEAR_POINT = """
SELECT
    id,
    parcel_id,
    owner,
    prop_addr,
    zip_code,
    appraised_value,
    market_value,
    land_acres,
    class_cd,
    zoning,
    ST_AsGeoJSON(geom)::json as geometry,
    ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
    ) as distance_meters
FROM parcels
WHERE ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
    $3
)
ORDER BY distance_meters
LIMIT $4
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

# Find what parcel contains a point
PARCEL_AT_POINT = """
SELECT
    id,
    parcel_id,
    owner,
    prop_addr,
    zip_code,
    appraised_value,
    market_value,
    land_acres,
    class_cd,
    year_built,
    zoning,
    prop_type,
    ST_AsGeoJSON(geom)::json as geometry
FROM parcels
WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($2, $1), 4326))
LIMIT 1
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
