"""
Parcels router.

Endpoints:
- GET /parcels/{parcel_id} - Get single parcel by ID
- GET /parcels - List parcels with filters
- GET /owners/top - Top owners by metric
- POST /parcels/spatial - Find parcels intersecting a geometry
"""

import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.db.connection import database_pool
from app.db.cache import redis_cache
from app.db.queries import parcels as queries
from app.models.parcels import (
    Parcel,
    ParcelList,
    TopOwners,
    SpatialIntersectionResult,
)

router = APIRouter()


# ============================================================================
# Request Models
# ============================================================================

class SpatialIntersectionRequest(BaseModel):
    """Request body for spatial intersection query."""
    geometry: dict  # GeoJSON geometry
    limit: int = 100


# ============================================================================
# Helper Functions
# ============================================================================

def build_parcel_filters(
    owner: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    class_cd: Optional[str] = None,
    bbox: Optional[str] = None,
) -> tuple[str, str, list]:
    """
    Build dynamic WHERE filters for parcel queries.

    Returns:
        (query_filters, count_filters, params)
    """
    filters = []
    params = []
    param_num = 3  # Start after limit ($1) and offset ($2)

    if owner:
        filters.append(f"AND owner ILIKE ${param_num}")
        params.append(f"%{owner}%")
        param_num += 1

    if min_value is not None:
        filters.append(f"AND appraised_value >= ${param_num}")
        params.append(min_value)
        param_num += 1

    if max_value is not None:
        filters.append(f"AND appraised_value <= ${param_num}")
        params.append(max_value)
        param_num += 1

    if class_cd:
        filters.append(f"AND class_cd = ${param_num}")
        params.append(class_cd)
        param_num += 1

    if bbox:
        # bbox format: west,south,east,north
        try:
            west, south, east, north = map(float, bbox.split(","))
            filters.append(
                f"AND ST_Intersects(geom, ST_MakeEnvelope(${param_num}, ${param_num+1}, ${param_num+2}, ${param_num+3}, 4326))"
            )
            params.extend([west, south, east, north])
            param_num += 4
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid bbox format. Expected: west,south,east,north"
            )

    filter_str = " ".join(filters)
    return filter_str, filter_str, params


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/{parcel_id}", response_model=Parcel)
async def get_parcel(parcel_id: str):
    """
    Get single parcel by parcel ID.

    Args:
        parcel_id: Unique parcel identifier

    Returns:
        Parcel with geometry
    """
    # Check cache
    cache_key = redis_cache.generate_key("parcel", parcel_id)
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(queries.GET_PARCEL_BY_ID, parcel_id)

    if not row:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found")

    # Convert to dict and cache
    result = dict(row)
    await redis_cache.set(cache_key, result, ttl=3600)  # 1 hour

    return result


@router.get("/", response_model=ParcelList)
async def list_parcels(
    owner: Optional[str] = Query(None, description="Owner name (case-insensitive partial match)"),
    min_value: Optional[float] = Query(None, description="Minimum appraised value"),
    max_value: Optional[float] = Query(None, description="Maximum appraised value"),
    class_cd: Optional[str] = Query(None, description="Property class code"),
    bbox: Optional[str] = Query(None, description="Bounding box: west,south,east,north"),
    limit: int = Query(100, ge=1, le=1000, description="Results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    List parcels with optional filters.

    Filters:
    - owner: Partial match (case-insensitive)
    - min_value/max_value: Appraised value range
    - class_cd: Property class code
    - bbox: Bounding box (west,south,east,north)

    Returns:
        Paginated list of parcels
    """
    # Build filters
    filter_str, count_filter_str, filter_params = build_parcel_filters(
        owner=owner,
        min_value=min_value,
        max_value=max_value,
        class_cd=class_cd,
        bbox=bbox,
    )

    # Check cache
    cache_key = redis_cache.generate_key(
        "parcels:list",
        owner=owner or "",
        min_value=min_value or "",
        max_value=max_value or "",
        class_cd=class_cd or "",
        bbox=bbox or "",
        limit=limit,
        offset=offset,
    )
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Build queries
    list_query = queries.GET_PARCELS.format(
        owner_filter=filter_str,
        min_value_filter="",
        max_value_filter="",
        class_filter="",
        bbox_filter="",
    )
    count_query = queries.COUNT_PARCELS.format(
        owner_filter=count_filter_str,
        min_value_filter="",
        max_value_filter="",
        class_filter="",
        bbox_filter="",
    )

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        # Get total count
        count_row = await conn.fetchrow(count_query, *filter_params)
        total = count_row["total"]

        # Get parcels
        rows = await conn.fetch(list_query, limit, offset, *filter_params)

    parcels = [dict(row) for row in rows]
    result = {
        "parcels": parcels,
        "total": total,
        "limit": limit,
        "offset": offset,
    }

    # Cache result
    await redis_cache.set(cache_key, result, ttl=300)  # 5 minutes

    return result


@router.get("/owners/top", response_model=TopOwners)
async def get_top_owners(
    metric: str = Query("acreage", description="Sort metric: acreage|count|value"),
    limit: int = Query(40, ge=1, le=100, description="Number of top owners"),
):
    """
    Get top property owners by acreage, parcel count, or total value.

    Args:
        metric: Sort by 'acreage', 'count', or 'value'
        limit: Number of top owners to return (max 100)

    Returns:
        List of top owners with statistics
    """
    # Validate metric
    if metric not in ("acreage", "count", "value"):
        raise HTTPException(
            status_code=400,
            detail="Invalid metric. Must be 'acreage', 'count', or 'value'"
        )

    # Check cache
    cache_key = redis_cache.generate_key("owners:top", metric=metric, limit=limit)
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Select query based on metric
    if metric == "acreage":
        query = queries.TOP_OWNERS_BY_ACREAGE
    elif metric == "count":
        query = queries.TOP_OWNERS_BY_COUNT
    else:  # value
        query = queries.TOP_OWNERS_BY_VALUE

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, limit)

    owners = [dict(row) for row in rows]
    result = {
        "owners": owners,
        "metric": metric,
        "limit": limit,
    }

    # Cache result
    await redis_cache.set(cache_key, result, ttl=3600)  # 1 hour

    return result


@router.post("/spatial", response_model=SpatialIntersectionResult)
async def find_intersecting_parcels(request: SpatialIntersectionRequest):
    """
    Find parcels intersecting a GeoJSON geometry (e.g., user-drawn polygon).

    Request body:
        {
            "geometry": {...},  // GeoJSON geometry
            "limit": 100
        }

    Returns:
        Parcels intersecting the geometry, sorted by intersection area
    """
    import json

    # Validate geometry
    if not request.geometry or "type" not in request.geometry:
        raise HTTPException(
            status_code=400,
            detail="Invalid GeoJSON geometry"
        )

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            queries.PARCELS_INTERSECTING_GEOMETRY,
            json.dumps(request.geometry),
            request.limit
        )

    parcels = [dict(row) for row in rows]
    result = {
        "parcels": parcels,
        "total": len(parcels),
    }

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
        LIMIT 1000
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
