"""
Transit router.

Endpoints:
- GET /transit/routes - Get all transit routes
- GET /transit/routes/{route_id} - Get single route by ID
- GET /transit/stops - Get stops (optionally filtered by route_id)
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from app.db.connection import database_pool
from app.db.cache import redis_cache
from app.db.queries import transit as queries
from app.models.transit import Route, Routes, Stops

router = APIRouter()


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/routes", response_model=Routes)
async def get_routes():
    """
    Get all transit routes with geometry.

    Returns:
        List of all routes
    """
    # Check cache
    cache_key = redis_cache.generate_key("transit:routes")
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(queries.GET_ROUTES)

    routes = [dict(row) for row in rows]
    result = {
        "routes": routes,
        "total": len(routes),
    }

    # Cache result
    await redis_cache.set(cache_key, result, ttl=3600)  # 1 hour

    return result


@router.get("/routes/{route_id}", response_model=Route)
async def get_route(route_id: str):
    """
    Get single transit route by ID.

    Args:
        route_id: Unique route identifier

    Returns:
        Route with geometry
    """
    # Check cache
    cache_key = redis_cache.generate_key("transit:route", route_id)
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(queries.GET_ROUTE_BY_ID, route_id)

    if not row:
        raise HTTPException(status_code=404, detail=f"Route {route_id} not found")

    # Convert to dict and cache
    result = dict(row)
    await redis_cache.set(cache_key, result, ttl=3600)  # 1 hour

    return result


@router.get("/stops", response_model=Stops)
async def get_stops(
    route_id: Optional[str] = Query(None, description="Filter stops by route ID"),
    limit: int = Query(1000, ge=1, le=5000, description="Results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    Get transit stops, optionally filtered by route.

    Args:
        route_id: Optional route ID to filter stops
        limit: Results per page (max 5000)
        offset: Offset for pagination

    Returns:
        List of stops
    """
    # Check cache
    cache_key = redis_cache.generate_key(
        "transit:stops",
        route_id=route_id or "all",
        limit=limit,
        offset=offset,
    )
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        if route_id:
            # Get stops for specific route
            rows = await conn.fetch(queries.GET_STOPS_BY_ROUTE, route_id)
        else:
            # Get all stops (paginated)
            rows = await conn.fetch(queries.GET_ALL_STOPS, limit, offset)

    stops = [dict(row) for row in rows]
    result = {
        "stops": stops,
        "total": len(stops),
    }

    # Cache result
    await redis_cache.set(cache_key, result, ttl=600)  # 10 minutes

    return result
