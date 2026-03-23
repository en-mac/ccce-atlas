#!/usr/bin/env python3
"""
ccce-atlas Data Migration Script

Loads all GeoJSON data from ../ccce-platform into PostGIS database.
Handles large files efficiently with batching and async operations.

Usage:
    python migrate.py --all
    python migrate.py --parcels
    python migrate.py --transit
    python migrate.py --pois
    python migrate.py --schools
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin
import argparse

import asyncpg
import httpx
from tqdm import tqdm

# ============================================================================
# Configuration
# ============================================================================

# Database connection
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://ccce_atlas:ccce_atlas_dev@localhost:5432/ccce_atlas"
)

# Source data paths (relative to this script)
SCRIPT_DIR = Path(__file__).parent
PLATFORM_DIR = SCRIPT_DIR.parent.parent.parent / "ccce-platform"
DATA_DIR = PLATFORM_DIR / "apps" / "map" / "public" / "data"
DATA_DIR_ALT = PLATFORM_DIR / "apps" / "map" / "data"  # Alternative location for parcels

# S3 URL for parcels (too large for git)
PARCELS_S3_URL = "https://ccce-atlas.s3.us-east-1.amazonaws.com/parcels_with_data.geojson"

# Batch size for bulk inserts
BATCH_SIZE = 500

# ============================================================================
# Database Connection Pool
# ============================================================================

async def get_pool() -> asyncpg.Pool:
    """Create and return asyncpg connection pool."""
    return await asyncpg.create_pool(
        DATABASE_URL,
        min_size=5,
        max_size=20,
        command_timeout=300,
    )

# ============================================================================
# Utility Functions
# ============================================================================

async def fetch_geojson_from_url(url: str) -> Dict[str, Any]:
    """Fetch GeoJSON from URL (for S3-hosted parcels)."""
    print(f"Fetching {url}...")
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()

def load_geojson_from_file(file_path: Path) -> Dict[str, Any]:
    """Load GeoJSON from local file."""
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def batch_items(items: List[Any], batch_size: int) -> List[List[Any]]:
    """Split list into batches."""
    return [items[i:i + batch_size] for i in range(0, len(items), batch_size)]

# ============================================================================
# PARCELS Migration
# ============================================================================

async def migrate_parcels(pool: asyncpg.Pool, source: str = "s3"):
    """
    Migrate parcels data to PostGIS.

    Source: parcels_with_data.geojson (183MB, 156K features)
    Properties: OBJECTID, parcel_id, owner, prop_addr, zip_code,
                appraised_, market, land_acres, class_cd, year_built,
                zoning, prop_type
    """
    print("\n" + "="*80)
    print("MIGRATING PARCELS")
    print("="*80)

    # Load GeoJSON
    if source == "s3":
        geojson = await fetch_geojson_from_url(PARCELS_S3_URL)
    else:
        # Try primary location first
        file_path = DATA_DIR / "parcels_with_data.geojson"
        if not file_path.exists():
            # Try alternative location
            file_path = DATA_DIR_ALT / "parcels_with_data.geojson"
            print(f"Primary location not found, trying alternate: {file_path}")

        if not file_path.exists():
            raise FileNotFoundError(
                f"parcels_with_data.geojson not found in:\n"
                f"  - {DATA_DIR}\n"
                f"  - {DATA_DIR_ALT}\n"
                f"Use --parcels-source s3 to fetch from S3 instead."
            )

        print(f"Loading from {file_path}...")
        geojson = load_geojson_from_file(file_path)

    features = geojson.get("features", [])
    print(f"Found {len(features)} parcels")

    # Clear existing data
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE parcels RESTART IDENTITY CASCADE")
        print("Cleared existing parcels")

    # Prepare batches
    batches = batch_items(features, BATCH_SIZE)

    # Insert in batches with progress bar
    total_inserted = 0
    for batch in tqdm(batches, desc="Inserting parcels", unit="batch"):
        async with pool.acquire() as conn:
            async with conn.transaction():
                for feature in batch:
                    props = feature.get("properties", {})
                    geom = feature.get("geometry")

                    if not geom:
                        continue

                    # Extract properties with safe fallbacks
                    # Property name mappings from source GeoJSON:
                    # - parcel_id: PROP_ID or TAXID
                    # - owner: file_as_na
                    # - prop_addr: situs_disp
                    # - zip_code: addr_zip
                    # - year_built: yr_blt
                    # - prop_type: prop_type_
                    await conn.execute("""
                        INSERT INTO parcels (
                            objectid, parcel_id, owner, prop_addr, zip_code,
                            appraised_value, market_value, land_acres,
                            class_cd, year_built, zoning, prop_type, geom
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                            ST_GeomFromGeoJSON($13)
                        )
                        ON CONFLICT (parcel_id) DO UPDATE SET
                            objectid = EXCLUDED.objectid,
                            owner = EXCLUDED.owner,
                            prop_addr = EXCLUDED.prop_addr,
                            zip_code = EXCLUDED.zip_code,
                            appraised_value = EXCLUDED.appraised_value,
                            market_value = EXCLUDED.market_value,
                            land_acres = EXCLUDED.land_acres,
                            class_cd = EXCLUDED.class_cd,
                            year_built = EXCLUDED.year_built,
                            zoning = EXCLUDED.zoning,
                            prop_type = EXCLUDED.prop_type,
                            geom = EXCLUDED.geom
                    """,
                        props.get("OBJECTID"),
                        str(props.get("PROP_ID") or props.get("TAXID")) if props.get("PROP_ID") or props.get("TAXID") else None,
                        props.get("file_as_na"),
                        props.get("situs_disp"),
                        props.get("addr_zip"),
                        props.get("appraised_"),
                        props.get("market"),
                        props.get("land_acres"),
                        props.get("class_cd"),
                        props.get("yr_blt"),
                        props.get("zoning"),
                        props.get("prop_type_"),
                        json.dumps(geom)
                    )
                    total_inserted += 1

    print(f"✓ Inserted {total_inserted} parcels")

    # Generate simplified geometries (ONE-TIME batch operation)
    print("Generating simplified geometries for all parcels...")
    async with pool.acquire() as conn:
        await conn.execute("SELECT simplify_all_parcels()")

    print("✓ Simplified geometries generated")

    # Refresh materialized view
    async with pool.acquire() as conn:
        await conn.execute("REFRESH MATERIALIZED VIEW parcels_by_zip")

    print("✓ Refreshed materialized views")

# ============================================================================
# TRANSIT Migration
# ============================================================================

async def migrate_transit_routes(pool: asyncpg.Pool):
    """Migrate transit routes to PostGIS."""
    print("\n" + "="*80)
    print("MIGRATING TRANSIT ROUTES")
    print("="*80)

    file_path = DATA_DIR / "transit_routes.geojson"

    if not file_path.exists():
        print(f"⚠ File not found: {file_path}")
        return

    geojson = load_geojson_from_file(file_path)
    features = geojson.get("features", [])
    print(f"Found {len(features)} routes")

    # Clear existing data
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE transit_routes RESTART IDENTITY CASCADE")

    # Insert routes
    total_inserted = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            for feature in tqdm(features, desc="Inserting routes"):
                props = feature.get("properties", {})
                geom = feature.get("geometry")

                if not geom:
                    continue

                # Use shape_id as unique identifier (route_id has duplicates for different directions)
                shape_id = props.get("shape_id") or props.get("SHAPE_ID") or f"shape_{total_inserted}"

                await conn.execute("""
                    INSERT INTO transit_routes (
                        route_id, route_name, route_number,
                        route_color, route_type, description, geom
                    ) VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromGeoJSON($7))
                """,
                    shape_id,  # Use unique shape_id instead of route_id
                    props.get("route_name") or props.get("ROUTE_NAME"),
                    props.get("route_short_name") or props.get("ROUTE_NUM") or props.get("route_id"),
                    props.get("color") or props.get("route_color") or props.get("COLOR") or "#0066CC",
                    props.get("route_type") or props.get("TYPE") or "bus",
                    props.get("route_long_name") or props.get("description") or props.get("DESC"),
                    json.dumps(geom)
                )
                total_inserted += 1

    print(f"✓ Inserted {total_inserted} transit routes")

async def migrate_transit_stops(pool: asyncpg.Pool):
    """Migrate transit stops to PostGIS (from 43 stop files)."""
    print("\n" + "="*80)
    print("MIGRATING TRANSIT STOPS")
    print("="*80)

    # Find all transit_stops_route_*.geojson files
    stop_files = sorted(DATA_DIR.glob("transit_stops_route_*.geojson"))
    print(f"Found {len(stop_files)} stop files")

    if not stop_files:
        print("⚠ No transit stop files found")
        return

    # Clear existing data
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE transit_stops RESTART IDENTITY CASCADE")

    total_inserted = 0

    for file_path in tqdm(stop_files, desc="Processing stop files"):
        geojson = load_geojson_from_file(file_path)
        features = geojson.get("features", [])

        # Extract route number from filename (e.g., transit_stops_route_12.geojson -> 12)
        route_number = file_path.stem.replace("transit_stops_route_", "").lstrip("0") or "0"

        async with pool.acquire() as conn:
            async with conn.transaction():
                for idx, feature in enumerate(features):
                    props = feature.get("properties", {})
                    geom = feature.get("geometry")

                    if not geom:
                        continue

                    await conn.execute("""
                        INSERT INTO transit_stops (
                            stop_id, stop_name, route_id,
                            stop_sequence, direction, geom
                        ) VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6))
                        ON CONFLICT (stop_id) DO NOTHING
                    """,
                        props.get("stop_id") or f"route_{route_number}_stop_{idx}",
                        props.get("stop_name") or props.get("name"),
                        route_number,  # Store just the route number to match route_number column in routes
                        props.get("stop_sequence") or props.get("sequence") or idx,
                        props.get("direction") or "unknown",
                        json.dumps(geom)
                    )
                    total_inserted += 1

    print(f"✓ Inserted {total_inserted} transit stops")

# ============================================================================
# POIS Migration
# ============================================================================

async def migrate_pois(pool: asyncpg.Pool):
    """
    Migrate POIs to PostGIS.

    Categories: beaches, trails, eats, coffee, bookstores,
                libraries, activities, community
    """
    print("\n" + "="*80)
    print("MIGRATING POIS")
    print("="*80)

    categories = [
        "beaches", "trails", "eats", "coffee",
        "bookstores", "libraries", "activities", "community"
    ]

    # Clear existing data
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE pois RESTART IDENTITY CASCADE")

    total_inserted = 0

    for category in categories:
        file_path = DATA_DIR / f"{category}.geojson"

        if not file_path.exists():
            print(f"⚠ Skipping {category}: file not found")
            continue

        geojson = load_geojson_from_file(file_path)
        features = geojson.get("features", [])

        print(f"Processing {category}: {len(features)} features")

        async with pool.acquire() as conn:
            async with conn.transaction():
                for idx, feature in enumerate(features):
                    props = feature.get("properties", {})
                    geom = feature.get("geometry")

                    if not geom:
                        continue

                    await conn.execute("""
                        INSERT INTO pois (
                            poi_id, name, category, subcategory,
                            description, address, phone, website, hours, geom
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ST_GeomFromGeoJSON($10))
                    """,
                        props.get("id") or f"{category}_{idx}",
                        props.get("name") or props.get("NAME"),
                        category,
                        props.get("subcategory") or props.get("type"),
                        props.get("description") or props.get("desc"),
                        props.get("address") or props.get("ADDRESS"),
                        props.get("phone") or props.get("PHONE"),
                        props.get("website") or props.get("url"),
                        props.get("hours") or props.get("HOURS"),
                        json.dumps(geom)
                    )
                    total_inserted += 1

    print(f"✓ Inserted {total_inserted} POIs across {len(categories)} categories")

    # Refresh materialized view
    async with pool.acquire() as conn:
        await conn.execute("REFRESH MATERIALIZED VIEW pois_by_category")

# ============================================================================
# SCHOOL DISTRICTS Migration
# ============================================================================

async def migrate_school_districts(pool: asyncpg.Pool):
    """Migrate school districts to PostGIS."""
    print("\n" + "="*80)
    print("MIGRATING SCHOOL DISTRICTS")
    print("="*80)

    file_path = DATA_DIR / "school_districts.geojson"

    if not file_path.exists():
        print(f"⚠ File not found: {file_path}")
        return

    geojson = load_geojson_from_file(file_path)
    features = geojson.get("features", [])
    print(f"Found {len(features)} school districts")

    # Clear existing data
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE school_districts RESTART IDENTITY CASCADE")

    total_inserted = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            for idx, feature in enumerate(tqdm(features, desc="Inserting districts")):
                props = feature.get("properties", {})
                geom = feature.get("geometry")

                if not geom:
                    continue

                await conn.execute("""
                    INSERT INTO school_districts (
                        district_id, district_name, district_type,
                        enrollment, grade_levels, geom
                    ) VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6))
                """,
                    props.get("district_id") or props.get("DIST_ID") or f"district_{idx}",
                    props.get("district_name") or props.get("NAME"),
                    props.get("district_type") or props.get("TYPE") or "elementary",
                    props.get("enrollment") or props.get("ENROLLMENT"),
                    props.get("grade_levels") or props.get("GRADES"),
                    json.dumps(geom)
                )
                total_inserted += 1

    print(f"✓ Inserted {total_inserted} school districts")

# ============================================================================
# Main Migration Runner
# ============================================================================

async def run_migrations(args):
    """Run specified migrations."""
    pool = await get_pool()

    try:
        if args.all or args.parcels:
            await migrate_parcels(pool, source=args.parcels_source)

        if args.all or args.transit:
            await migrate_transit_routes(pool)
            await migrate_transit_stops(pool)

        if args.all or args.pois:
            await migrate_pois(pool)

        if args.all or args.schools:
            await migrate_school_districts(pool)

        # VACUUM ANALYZE all tables
        print("\n" + "="*80)
        print("OPTIMIZING DATABASE")
        print("="*80)

        async with pool.acquire() as conn:
            tables = ["parcels", "transit_routes", "transit_stops", "pois", "school_districts"]
            for table in tqdm(tables, desc="Running VACUUM ANALYZE"):
                await conn.execute(f"VACUUM ANALYZE {table}")

        print("✓ Database optimization complete")

        print("\n" + "="*80)
        print("MIGRATION COMPLETE!")
        print("="*80)

    finally:
        await pool.close()

# ============================================================================
# CLI Entry Point
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Migrate GeoJSON data to PostGIS")
    parser.add_argument("--all", action="store_true", help="Migrate all data")
    parser.add_argument("--parcels", action="store_true", help="Migrate parcels only")
    parser.add_argument("--transit", action="store_true", help="Migrate transit only")
    parser.add_argument("--pois", action="store_true", help="Migrate POIs only")
    parser.add_argument("--schools", action="store_true", help="Migrate school districts only")
    parser.add_argument(
        "--parcels-source",
        choices=["s3", "local"],
        default="s3",
        help="Source for parcels data (s3 or local)"
    )

    args = parser.parse_args()

    # Default to --all if no flags specified
    if not any([args.all, args.parcels, args.transit, args.pois, args.schools]):
        args.all = True

    asyncio.run(run_migrations(args))

if __name__ == "__main__":
    main()
