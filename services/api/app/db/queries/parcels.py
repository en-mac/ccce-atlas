"""
Parcel queries for PostGIS database.

All queries return GeoJSON geometries and use parameterized queries.
"""

# Get single parcel by ID
GET_PARCEL_BY_ID = """
SELECT
    id,
    objectid,
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
    ST_AsGeoJSON(geom)::json as geometry,
    created_at,
    updated_at
FROM parcels
WHERE parcel_id = $1
"""

# List parcels with filters
GET_PARCELS = """
SELECT
    id,
    objectid,
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
WHERE 1=1
    {owner_filter}
    {min_value_filter}
    {max_value_filter}
    {class_filter}
    {bbox_filter}
ORDER BY parcel_id
LIMIT $1 OFFSET $2
"""

# Count parcels (for pagination)
COUNT_PARCELS = """
SELECT COUNT(*) as total
FROM parcels
WHERE 1=1
    {owner_filter}
    {min_value_filter}
    {max_value_filter}
    {class_filter}
    {bbox_filter}
"""

# Top owners by acreage
TOP_OWNERS_BY_ACREAGE = """
SELECT
    owner,
    COUNT(*) as parcel_count,
    SUM(land_acres) as total_acres,
    SUM(appraised_value) as total_appraised_value,
    SUM(market_value) as total_market_value,
    AVG(appraised_value) as avg_appraised_value
FROM parcels
WHERE owner IS NOT NULL AND owner != ''
GROUP BY owner
ORDER BY SUM(land_acres) DESC
LIMIT $1
"""

# Top owners by count
TOP_OWNERS_BY_COUNT = """
SELECT
    owner,
    COUNT(*) as parcel_count,
    SUM(land_acres) as total_acres,
    SUM(appraised_value) as total_appraised_value,
    SUM(market_value) as total_market_value,
    AVG(appraised_value) as avg_appraised_value
FROM parcels
WHERE owner IS NOT NULL AND owner != ''
GROUP BY owner
ORDER BY COUNT(*) DESC
LIMIT $1
"""

# Top owners by value
TOP_OWNERS_BY_VALUE = """
SELECT
    owner,
    COUNT(*) as parcel_count,
    SUM(land_acres) as total_acres,
    SUM(appraised_value) as total_appraised_value,
    SUM(market_value) as total_market_value,
    AVG(appraised_value) as avg_appraised_value
FROM parcels
WHERE owner IS NOT NULL AND owner != ''
GROUP BY owner
ORDER BY SUM(appraised_value) DESC
LIMIT $1
"""

# Find parcels intersecting a GeoJSON geometry
PARCELS_INTERSECTING_GEOMETRY = """
SELECT
    id,
    objectid,
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
    ST_AsGeoJSON(geom)::json as geometry,
    ST_Area(ST_Intersection(geom, ST_GeomFromGeoJSON($1))) as intersection_area
FROM parcels
WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1))
ORDER BY intersection_area DESC
LIMIT $2
"""
