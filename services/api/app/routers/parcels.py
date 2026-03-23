"""
Parcels router.

Endpoints:
- GET /parcels/tiles/{z}/{x}/{y}.json - Get parcel tile as GeoJSON
- GET /parcels/{parcel_id}/geometry - Get parcel geometry for highlighting
"""

import json
from fastapi import APIRouter, HTTPException

from app.db.connection import database_pool
from app.db.cache import redis_cache
from app.db.queries import parcels as queries
from app.models.parcels import ParcelGeometry

router = APIRouter()


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/{parcel_id}/geometry", response_model=ParcelGeometry)
async def get_parcel_geometry(parcel_id: str):
    """
    Get just the geometry for a parcel (lightweight endpoint for boundary highlighting).

    Args:
        parcel_id: Unique parcel identifier

    Returns:
        Parcel geometry as GeoJSON
    """
    # Check cache
    cache_key = redis_cache.generate_key("parcel:geometry", parcel_id)
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(queries.GET_PARCEL_GEOMETRY, parcel_id)

    if not row:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found")

    # Convert to dict and cache
    result = dict(row)
    await redis_cache.set(cache_key, result, ttl=3600)  # 1 hour

    return result


@router.get("/tiles/{z}/{x}/{y}.json")
async def get_parcel_tile(z: int, x: int, y: int):
    """
    Get parcel tile as GeoJSON for a given z/x/y coordinate.

    This endpoint serves vector tiles in GeoJSON format for efficient
    rendering of large parcel datasets in Cesium.

    Args:
        z: Zoom level (0-22)
        x: Tile X coordinate
        y: Tile Y coordinate

    Returns:
        GeoJSON FeatureCollection with parcels in the tile
    """
    # Calculate tile bounds in lat/lon
    from math import pi, atan, sinh

    n = 2.0 ** z
    lon_min = x / n * 360.0 - 180.0
    lat_max = atan(sinh(pi * (1 - 2 * y / n))) * 180.0 / pi
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_min = atan(sinh(pi * (1 - 2 * (y + 1) / n))) * 180.0 / pi

    # Check cache
    cache_key = redis_cache.generate_key("tile", f"{z}/{x}/{y}")
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query parcels in tile bounds with simplified geometry
    # Simplification tolerance increases with zoom level (more detail at higher zoom)
    tolerance = 0.0001 * (20 - z) if z < 20 else 0.00001

    query = """
        SELECT
            ST_AsGeoJSON(ST_Simplify(geom, $5))::json as geometry,
            parcel_id,
            owner,
            prop_addr as address,
            appraised_value,
            market_value,
            land_acres,
            class_cd,
            year_built,
            prop_type
        FROM parcels
        WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        LIMIT 5000
    """

    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, lon_min, lat_min, lon_max, lat_max, tolerance)

    # Convert to GeoJSON FeatureCollection
    features = []
    for row in rows:
        # Parse geometry if it's a string (asyncpg returns json as dict, but just in case)
        geometry = row["geometry"]
        if isinstance(geometry, str):
            geometry = json.loads(geometry)

        feature = {
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "parcel_id": row["parcel_id"],
                "owner": row["owner"],
                "address": row["address"],
                "appraised_value": float(row["appraised_value"]) if row["appraised_value"] else 0,
                "market_value": float(row["market_value"]) if row["market_value"] else 0,
                "land_acres": float(row["land_acres"]) if row["land_acres"] else 0,
                "class_cd": row["class_cd"],
                "year_built": row["year_built"],
                "prop_type": row["prop_type"],
            }
        }
        features.append(feature)

    result = {
        "type": "FeatureCollection",
        "features": features
    }

    # Cache tile for 1 week (tiles don't change often)
    await redis_cache.set(cache_key, result, ttl=604800)

    return result
