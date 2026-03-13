"""
Spatial queries router.

Endpoints:
- GET /spatial/parcels/near - Find parcels near a point
- GET /spatial/pois/near - Find POIs near a point
- GET /spatial/point - What parcel/POIs are at this point
"""

from fastapi import APIRouter, Query

from app.db.connection import database_pool
from app.db.cache import redis_cache
from app.db.queries import spatial as queries
from app.models.spatial import NearbyParcels, NearbyPOIs, PointQuery

router = APIRouter()


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/parcels/near", response_model=NearbyParcels)
async def get_parcels_near_point(
    lat: float = Query(..., description="Latitude", ge=-90, le=90),
    lon: float = Query(..., description="Longitude", ge=-180, le=180),
    radius_meters: float = Query(1000, description="Search radius in meters", ge=1, le=10000),
    limit: int = Query(50, description="Maximum results", ge=1, le=500),
):
    """
    Find parcels within radius of a point.

    Args:
        lat: Latitude
        lon: Longitude
        radius_meters: Search radius in meters (max 10km)
        limit: Maximum results (max 500)

    Returns:
        Nearby parcels with distance in meters
    """
    # Check cache
    cache_key = redis_cache.generate_key(
        "spatial:parcels:near",
        lat=lat,
        lon=lon,
        radius=radius_meters,
        limit=limit,
    )
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            queries.PARCELS_NEAR_POINT,
            lat,
            lon,
            radius_meters,
            limit
        )

    parcels = [dict(row) for row in rows]
    result = {
        "parcels": parcels,
        "center": {"lat": lat, "lon": lon},
        "radius_meters": radius_meters,
        "total": len(parcels),
    }

    # Cache result
    await redis_cache.set(cache_key, result, ttl=600)  # 10 minutes

    return result


@router.get("/pois/near", response_model=NearbyPOIs)
async def get_pois_near_point(
    lat: float = Query(..., description="Latitude", ge=-90, le=90),
    lon: float = Query(..., description="Longitude", ge=-180, le=180),
    radius_meters: float = Query(1000, description="Search radius in meters", ge=1, le=10000),
    limit: int = Query(50, description="Maximum results", ge=1, le=500),
    category: str | None = Query(None, description="Filter by POI category (e.g., 'coffee', 'beaches')"),
):
    """
    Find POIs within radius of a point.

    Args:
        lat: Latitude
        lon: Longitude
        radius_meters: Search radius in meters (max 10km)
        limit: Maximum results (max 500)
        category: Optional category filter (e.g., 'coffee', 'beaches')

    Returns:
        Nearby POIs with distance in meters
    """
    # Check cache
    cache_key = redis_cache.generate_key(
        "spatial:pois:near",
        lat=lat,
        lon=lon,
        radius=radius_meters,
        limit=limit,
        category=category,
    )
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        if category:
            rows = await conn.fetch(
                queries.POIS_NEAR_POINT_BY_CATEGORY,
                lat,
                lon,
                radius_meters,
                limit,
                category
            )
        else:
            rows = await conn.fetch(
                queries.POIS_NEAR_POINT,
                lat,
                lon,
                radius_meters,
                limit
            )

    pois = [dict(row) for row in rows]
    result = {
        "pois": pois,
        "center": {"lat": lat, "lon": lon},
        "radius_meters": radius_meters,
        "total": len(pois),
    }

    # Cache result
    await redis_cache.set(cache_key, result, ttl=600)  # 10 minutes

    return result


@router.get("/point", response_model=PointQuery)
async def query_point(
    lat: float = Query(..., description="Latitude", ge=-90, le=90),
    lon: float = Query(..., description="Longitude", ge=-180, le=180),
):
    """
    Find what parcel and nearby POIs are at a specific point.

    Args:
        lat: Latitude
        lon: Longitude

    Returns:
        Parcel containing the point (if any) and nearby POIs (within 10m)
    """
    # Check cache
    cache_key = redis_cache.generate_key("spatial:point", lat=lat, lon=lon)
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        # Find parcel at point
        parcel_row = await conn.fetchrow(queries.PARCEL_AT_POINT, lat, lon)

        # Find POIs at/near point (within 10 meters)
        poi_rows = await conn.fetch(queries.POIS_AT_POINT, lat, lon)

    result = {
        "parcel": dict(parcel_row) if parcel_row else None,
        "pois": [dict(row) for row in poi_rows],
        "location": {"lat": lat, "lon": lon},
    }

    # Cache result
    await redis_cache.set(cache_key, result, ttl=600)  # 10 minutes

    return result
