"""
POIs (Points of Interest) router.

Endpoints:
- GET /pois/{poi_id} - Get single POI by ID
- GET /pois - List POIs with filters
- GET /pois/categories - Get distinct categories
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from app.db.connection import database_pool
from app.db.cache import redis_cache
from app.db.queries import pois as queries
from app.models.pois import POI, POIList, Categories

router = APIRouter()


# ============================================================================
# Helper Functions
# ============================================================================

def build_poi_filters(
    category: Optional[str] = None,
    bbox: Optional[str] = None,
) -> tuple[str, str, list]:
    """
    Build dynamic WHERE filters for POI queries.

    Returns:
        (query_filters, count_filters, params)
    """
    filters = []
    params = []
    param_num = 3  # Start after limit ($1) and offset ($2)

    if category:
        filters.append(f"AND category = ${param_num}")
        params.append(category)
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

@router.get("/{poi_id}", response_model=POI)
async def get_poi(poi_id: str):
    """
    Get single POI by ID.

    Args:
        poi_id: Unique POI identifier

    Returns:
        POI with geometry
    """
    # Check cache
    cache_key = redis_cache.generate_key("poi", poi_id)
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(queries.GET_POI_BY_ID, poi_id)

    if not row:
        raise HTTPException(status_code=404, detail=f"POI {poi_id} not found")

    # Convert to dict and cache
    result = dict(row)
    await redis_cache.set(cache_key, result, ttl=3600)  # 1 hour

    return result


@router.get("/", response_model=POIList)
async def list_pois(
    category: Optional[str] = Query(None, description="POI category filter"),
    bbox: Optional[str] = Query(None, description="Bounding box: west,south,east,north"),
    limit: int = Query(100, ge=1, le=1000, description="Results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    List POIs with optional filters.

    Filters:
    - category: POI category (beaches, trails, eats, coffee, etc.)
    - bbox: Bounding box (west,south,east,north)

    Returns:
        Paginated list of POIs
    """
    # Build filters
    filter_str, count_filter_str, filter_params = build_poi_filters(
        category=category,
        bbox=bbox,
    )

    # Check cache
    cache_key = redis_cache.generate_key(
        "pois:list",
        category=category or "",
        bbox=bbox or "",
        limit=limit,
        offset=offset,
    )
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Build queries
    list_query = queries.GET_POIS.format(
        category_filter=filter_str,
        bbox_filter="",
    )
    count_query = queries.COUNT_POIS.format(
        category_filter=count_filter_str,
        bbox_filter="",
    )

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        # Get total count
        count_row = await conn.fetchrow(count_query, *filter_params)
        total = count_row["total"]

        # Get POIs
        rows = await conn.fetch(list_query, limit, offset, *filter_params)

    pois = [dict(row) for row in rows]
    result = {
        "pois": pois,
        "total": total,
        "limit": limit,
        "offset": offset,
    }

    # Cache result
    await redis_cache.set(cache_key, result, ttl=300)  # 5 minutes

    return result


@router.get("/categories", response_model=Categories)
async def get_categories():
    """
    Get distinct POI categories with counts.

    Returns:
        List of categories with POI counts
    """
    # Check cache
    cache_key = redis_cache.generate_key("pois:categories")
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    # Query database
    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(queries.GET_CATEGORIES)

    categories = [dict(row) for row in rows]
    result = {"categories": categories}

    # Cache result
    await redis_cache.set(cache_key, result, ttl=3600)  # 1 hour

    return result
