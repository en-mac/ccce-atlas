"""
POI queries for PostGIS database.
"""

# Get single POI by ID
GET_POI_BY_ID = """
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
    created_at,
    updated_at
FROM pois
WHERE poi_id = $1
"""

# List POIs with filters
GET_POIS = """
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
    ST_AsGeoJSON(geom)::json as geometry
FROM pois
WHERE 1=1
    {category_filter}
    {bbox_filter}
ORDER BY name
LIMIT $1 OFFSET $2
"""

# Count POIs (for pagination)
COUNT_POIS = """
SELECT COUNT(*) as total
FROM pois
WHERE 1=1
    {category_filter}
    {bbox_filter}
"""

# Get distinct categories
GET_CATEGORIES = """
SELECT DISTINCT category, COUNT(*) as count
FROM pois
GROUP BY category
ORDER BY category
"""
