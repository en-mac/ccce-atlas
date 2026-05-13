-- CCCE Atlas RDS Schema Setup
-- Run this on your RDS PostgreSQL instance after creation
--
-- Usage:
--   psql -h ccce-atlas-db.xxxxx.us-east-1.rds.amazonaws.com \
--        -U postgres \
--        -d ccce_atlas \
--        -f setup-rds-schema.sql

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify PostGIS installation
SELECT PostGIS_Version();

-- ============================================================================
-- Tables
-- ============================================================================

-- Parcels table
CREATE TABLE IF NOT EXISTS parcels (
    id SERIAL PRIMARY KEY,
    objectid INTEGER,
    parcel_id TEXT,
    owner TEXT,
    prop_addr TEXT,
    zip_code TEXT,
    appraised_value NUMERIC,
    market_value NUMERIC,
    land_acres NUMERIC,
    class_cd TEXT,
    year_built INTEGER,
    zoning TEXT,
    prop_type TEXT,
    geom GEOMETRY(MultiPolygon, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- POIs table
CREATE TABLE IF NOT EXISTS pois (
    id SERIAL PRIMARY KEY,
    poi_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    address TEXT,
    geom GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transit routes table
CREATE TABLE IF NOT EXISTS transit_routes (
    id SERIAL PRIMARY KEY,
    route_id TEXT NOT NULL,
    route_number TEXT,
    route_name TEXT,
    direction TEXT,
    geom GEOMETRY(MultiLineString, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transit stops table
CREATE TABLE IF NOT EXISTS transit_stops (
    id SERIAL PRIMARY KEY,
    stop_id TEXT,
    stop_name TEXT,
    route_id TEXT,
    geom GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HRSA Primary Care HPSAs (Texas only) — perimeter polygons.
-- Source: HRSA gisportal HealthCareShortage MapServer layer 11.
-- Powers the Healthcare tab's "TX Shortage Heatmap" toggle.
CREATE TABLE IF NOT EXISTS hrsa_hpsa_tx (
    id              SERIAL PRIMARY KEY,
    hpsa_source_id  TEXT,
    hpsa_name       TEXT,
    hpsa_score      INTEGER,
    degree_of_shortage TEXT,
    designation_pop NUMERIC,
    res_civ_pop     NUMERIC,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hpsa_source_id)
);

-- Healthcare providers table — CompIntel Medicare anomaly data
-- Long form: one row per (npi, year). Source: compintel/scripts/build_atlas_handoff.py
CREATE TABLE IF NOT EXISTS healthcare_providers (
    id              SERIAL PRIMARY KEY,
    npi             BIGINT NOT NULL,
    year            INTEGER NOT NULL,
    specialty       TEXT,
    tier            TEXT,
    ensemble_score  DOUBLE PRECISION,
    iqr_score       DOUBLE PRECISION,
    iforest_score   DOUBLE PRECISION,
    lgbm_residual   DOUBLE PRECISION,
    med_mdcr_stdzd_amt NUMERIC,
    tot_benes       NUMERIC,
    geom GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(npi, year)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Spatial indexes (GIST)
CREATE INDEX IF NOT EXISTS parcels_geom_idx ON parcels USING GIST(geom);
CREATE INDEX IF NOT EXISTS pois_geom_idx ON pois USING GIST(geom);
CREATE INDEX IF NOT EXISTS transit_routes_geom_idx ON transit_routes USING GIST(geom);
CREATE INDEX IF NOT EXISTS transit_stops_geom_idx ON transit_stops USING GIST(geom);

-- Regular indexes for common queries
CREATE INDEX IF NOT EXISTS parcels_parcel_id_idx ON parcels(parcel_id);
CREATE INDEX IF NOT EXISTS parcels_owner_idx ON parcels(owner);
CREATE INDEX IF NOT EXISTS parcels_appraised_value_idx ON parcels(appraised_value);
CREATE INDEX IF NOT EXISTS pois_category_idx ON pois(category);
CREATE INDEX IF NOT EXISTS pois_poi_id_idx ON pois(poi_id);
CREATE INDEX IF NOT EXISTS transit_routes_route_id_idx ON transit_routes(route_id);

CREATE INDEX IF NOT EXISTS healthcare_providers_geom_idx ON healthcare_providers USING GIST(geom);
CREATE INDEX IF NOT EXISTS healthcare_providers_year_idx ON healthcare_providers(year);
CREATE INDEX IF NOT EXISTS healthcare_providers_npi_idx ON healthcare_providers(npi);
CREATE INDEX IF NOT EXISTS healthcare_providers_ensemble_score_idx
    ON healthcare_providers(year, ensemble_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS hrsa_hpsa_tx_geom_idx ON hrsa_hpsa_tx USING GIST(geom);
CREATE INDEX IF NOT EXISTS hrsa_hpsa_tx_score_idx ON hrsa_hpsa_tx(hpsa_score DESC NULLS LAST);

-- ============================================================================
-- Performance Tuning
-- ============================================================================

-- Analyze tables for query optimization (run after data load)
-- ANALYZE parcels;
-- ANALYZE pois;
-- ANALYZE transit_routes;
-- ANALYZE transit_stops;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check table structure
\dt

-- Check indexes
\di

-- Show table sizes (run after data load)
-- SELECT
--   schemaname,
--   tablename,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check PostGIS version
SELECT PostGIS_Version();

-- Success message
SELECT 'Schema setup complete! Run data migration next.' AS status;
