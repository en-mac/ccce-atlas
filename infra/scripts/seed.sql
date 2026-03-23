-- ccce-atlas PostGIS Database Schema
-- Production-quality schema for Corpus Christi / Nueces County civic geospatial platform

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Set default SRID for web mapping (WGS 84)
-- Note: All geometries stored in EPSG:4326, transformed to EPSG:3857 for tile serving

-- ============================================================================
-- PARCELS TABLE
-- Source: parcels_with_data.geojson (183MB, 156K features)
-- Simplified geometry at multiple zoom levels for performance
-- ============================================================================

CREATE TABLE IF NOT EXISTS parcels (
    id SERIAL PRIMARY KEY,
    objectid INTEGER,
    parcel_id VARCHAR(50) UNIQUE,
    owner VARCHAR(255),
    prop_addr VARCHAR(255),
    zip_code VARCHAR(10),
    appraised_value NUMERIC(12, 2),
    market_value NUMERIC(12, 2),
    land_acres NUMERIC(10, 4),
    class_cd VARCHAR(10),
    year_built INTEGER,
    zoning VARCHAR(50),
    prop_type VARCHAR(100),

    -- Full resolution geometry (EPSG:4326)
    geom GEOMETRY(MultiPolygon, 4326),

    -- Simplified geometries for different zoom levels (progressive simplification)
    -- zoom 8-10: heavily simplified (tolerance ~100m)
    geom_z8 GEOMETRY(MultiPolygon, 4326),
    -- zoom 11-13: moderately simplified (tolerance ~20m)
    geom_z11 GEOMETRY(MultiPolygon, 4326),
    -- zoom 14-16: lightly simplified (tolerance ~5m)
    geom_z14 GEOMETRY(MultiPolygon, 4326),
    -- zoom 17+: full detail

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Spatial indexes for all geometry columns (critical for performance)
CREATE INDEX IF NOT EXISTS parcels_geom_idx ON parcels USING GIST(geom);
CREATE INDEX IF NOT EXISTS parcels_geom_z8_idx ON parcels USING GIST(geom_z8);
CREATE INDEX IF NOT EXISTS parcels_geom_z11_idx ON parcels USING GIST(geom_z11);
CREATE INDEX IF NOT EXISTS parcels_geom_z14_idx ON parcels USING GIST(geom_z14);

-- Regular indexes for common queries
CREATE INDEX IF NOT EXISTS parcels_parcel_id_idx ON parcels(parcel_id);
CREATE INDEX IF NOT EXISTS parcels_zip_code_idx ON parcels(zip_code);
CREATE INDEX IF NOT EXISTS parcels_class_cd_idx ON parcels(class_cd);
CREATE INDEX IF NOT EXISTS parcels_zoning_idx ON parcels(zoning);
CREATE INDEX IF NOT EXISTS parcels_prop_type_idx ON parcels(prop_type);

-- Composite index for value-based queries
CREATE INDEX IF NOT EXISTS parcels_values_idx ON parcels(appraised_value, market_value);

-- ============================================================================
-- TRANSIT ROUTES TABLE
-- Source: transit_routes.geojson (1.8MB)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transit_routes (
    id SERIAL PRIMARY KEY,
    route_id VARCHAR(50) UNIQUE,
    route_name VARCHAR(255),
    route_number VARCHAR(10),
    route_color VARCHAR(7),  -- hex color
    route_type VARCHAR(50),  -- bus, trolley, etc.
    description TEXT,

    geom GEOMETRY(MultiLineString, 4326),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transit_routes_geom_idx ON transit_routes USING GIST(geom);
CREATE INDEX IF NOT EXISTS transit_routes_route_id_idx ON transit_routes(route_id);
CREATE INDEX IF NOT EXISTS transit_routes_route_number_idx ON transit_routes(route_number);

-- ============================================================================
-- TRANSIT STOPS TABLE
-- Source: transit_stops_route_*.geojson (43 files)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transit_stops (
    id SERIAL PRIMARY KEY,
    stop_id VARCHAR(50) UNIQUE,
    stop_name VARCHAR(255),
    route_id VARCHAR(50) REFERENCES transit_routes(route_id),
    stop_sequence INTEGER,
    direction VARCHAR(50),  -- inbound, outbound

    geom GEOMETRY(Point, 4326),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transit_stops_geom_idx ON transit_stops USING GIST(geom);
CREATE INDEX IF NOT EXISTS transit_stops_stop_id_idx ON transit_stops(stop_id);
CREATE INDEX IF NOT EXISTS transit_stops_route_id_idx ON transit_stops(route_id);

-- ============================================================================
-- SCHOOL DISTRICTS TABLE
-- Source: school_districts.geojson
-- ============================================================================

CREATE TABLE IF NOT EXISTS school_districts (
    id SERIAL PRIMARY KEY,
    district_id VARCHAR(50) UNIQUE,
    district_name VARCHAR(255),
    district_type VARCHAR(50),  -- elementary, middle, high
    enrollment INTEGER,
    grade_levels VARCHAR(50),

    geom GEOMETRY(MultiPolygon, 4326),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS school_districts_geom_idx ON school_districts USING GIST(geom);
CREATE INDEX IF NOT EXISTS school_districts_district_id_idx ON school_districts(district_id);
CREATE INDEX IF NOT EXISTS school_districts_district_type_idx ON school_districts(district_type);

-- ============================================================================
-- POIS (Points of Interest) TABLE
-- Source: beaches, trails, eats, coffee, bookstores, libraries, activities, community
-- Consolidated into single table with category field
-- ============================================================================

CREATE TABLE IF NOT EXISTS pois (
    id SERIAL PRIMARY KEY,
    poi_id VARCHAR(50) UNIQUE,
    name VARCHAR(255),
    category VARCHAR(50),  -- beaches, trails, eats, coffee, bookstores, libraries, activities, community
    subcategory VARCHAR(100),
    description TEXT,
    address VARCHAR(255),
    phone VARCHAR(20),
    website VARCHAR(255),
    hours VARCHAR(255),

    geom GEOMETRY(Point, 4326),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pois_geom_idx ON pois USING GIST(geom);
CREATE INDEX IF NOT EXISTS pois_poi_id_idx ON pois(poi_id);
CREATE INDEX IF NOT EXISTS pois_category_idx ON pois(category);
CREATE INDEX IF NOT EXISTS pois_name_idx ON pois(name);

-- ============================================================================
-- FUNCTION: Generate simplified geometries for parcels
-- Called ONCE after bulk insert, or on manual UPDATE only
-- DO NOT trigger on INSERT (would fire 156K times during migration)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_parcel_simplified_geoms()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate simplified geometries at different tolerances
    -- Tolerance in degrees (roughly meters at this latitude)
    -- zoom 8-10: tolerance 0.001 (~100m)
    NEW.geom_z8 = ST_Multi(ST_SimplifyPreserveTopology(NEW.geom, 0.001));

    -- zoom 11-13: tolerance 0.0002 (~20m)
    NEW.geom_z11 = ST_Multi(ST_SimplifyPreserveTopology(NEW.geom, 0.0002));

    -- zoom 14-16: tolerance 0.00005 (~5m)
    NEW.geom_z14 = ST_Multi(ST_SimplifyPreserveTopology(NEW.geom, 0.00005));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger ONLY on UPDATE (manual edits after migration)
-- NOT on INSERT (would kill performance during bulk load)
CREATE TRIGGER parcels_simplify_trigger
    BEFORE UPDATE OF geom ON parcels
    FOR EACH ROW
    EXECUTE FUNCTION update_parcel_simplified_geoms();

-- ============================================================================
-- ONE-TIME simplification (run by migrate.py after bulk insert)
-- ============================================================================

-- This is a stored procedure that migrate.py will call ONCE after loading all parcels
CREATE OR REPLACE FUNCTION simplify_all_parcels()
RETURNS void AS $$
BEGIN
    RAISE NOTICE 'Generating simplified geometries for all parcels...';

    UPDATE parcels SET
        geom_z8 = ST_Multi(ST_SimplifyPreserveTopology(geom, 0.001)),
        geom_z11 = ST_Multi(ST_SimplifyPreserveTopology(geom, 0.0002)),
        geom_z14 = ST_Multi(ST_SimplifyPreserveTopology(geom, 0.00005));

    RAISE NOTICE 'Simplified geometry generation complete.';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parcels_updated_at BEFORE UPDATE ON parcels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER transit_routes_updated_at BEFORE UPDATE ON transit_routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER transit_stops_updated_at BEFORE UPDATE ON transit_stops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER school_districts_updated_at BEFORE UPDATE ON school_districts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER pois_updated_at BEFORE UPDATE ON pois
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MATERIALIZED VIEWS for common spatial queries (optional, for performance)
-- ============================================================================

-- Parcel summary by zip code
CREATE MATERIALIZED VIEW IF NOT EXISTS parcels_by_zip AS
SELECT
    zip_code,
    COUNT(*) as parcel_count,
    SUM(land_acres) as total_acres,
    AVG(appraised_value) as avg_appraised_value,
    AVG(market_value) as avg_market_value,
    ST_Union(geom_z8) as boundary
FROM parcels
WHERE zip_code IS NOT NULL
GROUP BY zip_code;

CREATE INDEX IF NOT EXISTS parcels_by_zip_boundary_idx ON parcels_by_zip USING GIST(boundary);

-- POI counts by category
CREATE MATERIALIZED VIEW IF NOT EXISTS pois_by_category AS
SELECT
    category,
    COUNT(*) as poi_count,
    ST_Collect(geom) as all_points
FROM pois
GROUP BY category;

-- ============================================================================
-- GRANT PERMISSIONS (for application user)
-- ============================================================================

-- Note: Create application user separately
-- CREATE USER ccce_atlas_api WITH PASSWORD 'your_secure_password';

-- GRANT CONNECT ON DATABASE ccce_atlas TO ccce_atlas_api;
-- GRANT USAGE ON SCHEMA public TO ccce_atlas_api;
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ccce_atlas_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ccce_atlas_api;

-- ============================================================================
-- VACUUM ANALYZE for initial optimization
-- Run after data import
-- ============================================================================

-- VACUUM ANALYZE parcels;
-- VACUUM ANALYZE transit_routes;
-- VACUUM ANALYZE transit_stops;
-- VACUUM ANALYZE school_districts;
-- VACUUM ANALYZE pois;
