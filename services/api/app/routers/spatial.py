"""
Spatial queries router.

Endpoints:
- GET /spatial/pois/near - Find POIs near a point
"""

from fastapi import APIRouter, Query

from app.db.connection import database_pool
from app.db.cache import redis_cache
from app.db.queries import spatial as queries
from app.models.spatial import NearbyPOIs

router = APIRouter()


# ============================================================================
# Endpoints
# ============================================================================

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
