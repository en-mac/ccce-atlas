"""
Transit queries for PostGIS database.
"""

# Get all routes
GET_ROUTES = """
SELECT
    id,
    route_id,
    route_name,
    route_number,
    route_color,
    route_type,
    description,
    ST_AsGeoJSON(geom)::json as geometry,
    created_at,
    updated_at
FROM transit_routes
ORDER BY route_number
"""

# Get single route by ID
GET_ROUTE_BY_ID = """
SELECT
    id,
    route_id,
    route_name,
    route_number,
    route_color,
    route_type,
    description,
    ST_AsGeoJSON(geom)::json as geometry,
    created_at,
    updated_at
FROM transit_routes
WHERE route_id = $1
"""

# Get stops for a route
GET_STOPS_BY_ROUTE = """
SELECT
    id,
    stop_id,
    stop_name,
    route_id,
    stop_sequence,
    direction,
    ST_AsGeoJSON(geom)::json as geometry,
    created_at,
    updated_at
FROM transit_stops
WHERE route_id = $1
ORDER BY stop_sequence
"""

# Get all stops
GET_ALL_STOPS = """
SELECT
    id,
    stop_id,
    stop_name,
    route_id,
    stop_sequence,
    direction,
    ST_AsGeoJSON(geom)::json as geometry
FROM transit_stops
ORDER BY route_id, stop_sequence
LIMIT $1 OFFSET $2
"""
