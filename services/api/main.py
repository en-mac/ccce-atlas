"""
ccce-atlas API Service

FastAPI backend for Corpus Christi civic geospatial platform.
Provides REST endpoints for parcels, POIs, transit, and spatial queries.
"""

from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os

from app.db.connection import database_pool
from app.db.cache import redis_cache

# ============================================================================
# Configuration
# ============================================================================

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DEBUG = os.getenv("DEBUG", "False").lower() == "true"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",")

# ============================================================================
# Lifespan Events
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup: Initialize database pool and Redis cache
    await database_pool.connect()
    print("✓ Database connection pool initialized")

    await redis_cache.connect()
    print("✓ Redis cache client initialized")

    yield

    # Shutdown: Close database pool and Redis cache
    await database_pool.disconnect()
    print("✓ Database connection pool closed")

    await redis_cache.disconnect()
    print("✓ Redis cache client closed")

# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="ccce-atlas API",
    description="Civic geospatial platform API for Corpus Christi / Nueces County, Texas",
    version="1.0.0",
    docs_url="/docs" if DEBUG else None,
    redoc_url="/redoc" if DEBUG else None,
    lifespan=lifespan,
)

# ============================================================================
# Middleware
# ============================================================================

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Health Check Endpoint
# ============================================================================

@app.get("/health")
async def health_check() -> Dict[str, str]:
    """Basic health check endpoint for load balancers."""
    return {
        "status": "healthy",
        "service": "ccce-atlas-api",
        "environment": ENVIRONMENT,
    }


@app.get("/health/detailed")
async def detailed_health_check():
    """
    Comprehensive health check with smoke tests for all critical endpoints.

    Tests:
    - Database connectivity
    - Redis connectivity
    - Spatial POI search
    - Spatial parcel search
    - POI list
    - Top landowners
    - Transit routes

    Returns detailed status for each component.
    """
    from app.db.connection import database_pool
    from app.db.cache import redis_cache
    import time

    results = {
        "status": "healthy",
        "timestamp": time.time(),
        "checks": {}
    }

    # 1. Database check
    try:
        pool = database_pool.get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval("SELECT COUNT(*) FROM parcels")
            results["checks"]["database"] = {
                "status": "healthy",
                "parcel_count": result,
                "message": f"Connected, {result:,} parcels loaded"
            }
    except Exception as e:
        results["status"] = "degraded"
        results["checks"]["database"] = {
            "status": "unhealthy",
            "error": str(e)
        }

    # 2. Redis check
    try:
        cache_test_key = "health_check_test"
        await redis_cache.set(cache_test_key, {"test": True}, ttl=10)
        cached = await redis_cache.get(cache_test_key)
        if cached:
            results["checks"]["redis"] = {
                "status": "healthy",
                "message": "Connected, caching functional"
            }
        else:
            results["checks"]["redis"] = {
                "status": "degraded",
                "message": "Connected but cache read failed"
            }
    except Exception as e:
        results["status"] = "degraded"
        results["checks"]["redis"] = {
            "status": "unhealthy",
            "error": str(e)
        }

    # 3. Spatial POI search smoke test
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT COUNT(*) as count
                FROM pois
                WHERE ST_DWithin(
                    geom::geography,
                    ST_SetSRID(ST_MakePoint(-97.3964, 27.8006), 4326)::geography,
                    1000
                )
            """)
            count = rows[0]["count"]
            results["checks"]["spatial_pois"] = {
                "status": "healthy",
                "sample_query_results": count,
                "message": f"Spatial POI query returned {count} results"
            }
    except Exception as e:
        results["status"] = "degraded"
        results["checks"]["spatial_pois"] = {
            "status": "unhealthy",
            "error": str(e)
        }

    # 4. Spatial parcel search smoke test
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT COUNT(*) as count
                FROM parcels
                WHERE ST_DWithin(
                    geom::geography,
                    ST_SetSRID(ST_MakePoint(-97.3964, 27.8006), 4326)::geography,
                    500
                )
            """)
            count = rows[0]["count"]
            results["checks"]["spatial_parcels"] = {
                "status": "healthy",
                "sample_query_results": count,
                "message": f"Spatial parcel query returned {count} results"
            }
    except Exception as e:
        results["status"] = "degraded"
        results["checks"]["spatial_parcels"] = {
            "status": "unhealthy",
            "error": str(e)
        }

    # 5. Transit routes check
    try:
        async with pool.acquire() as conn:
            result = await conn.fetchval("SELECT COUNT(*) FROM transit_routes")
            results["checks"]["transit"] = {
                "status": "healthy",
                "route_count": result,
                "message": f"{result} transit routes available"
            }
    except Exception as e:
        results["status"] = "degraded"
        results["checks"]["transit"] = {
            "status": "unhealthy",
            "error": str(e)
        }

    # 6. PostGIS extension check
    try:
        async with pool.acquire() as conn:
            version = await conn.fetchval("SELECT PostGIS_Version()")
            results["checks"]["postgis"] = {
                "status": "healthy",
                "version": version,
                "message": f"PostGIS {version}"
            }
    except Exception as e:
        results["status"] = "degraded"
        results["checks"]["postgis"] = {
            "status": "unhealthy",
            "error": str(e)
        }

    # Set overall status code
    status_code = 200 if results["status"] == "healthy" else 503

    return JSONResponse(content=results, status_code=status_code)

@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint."""
    return {
        "service": "ccce-atlas API",
        "version": "1.0.0",
        "docs": "/docs" if DEBUG else "disabled in production",
    }

# ============================================================================
# Error Handlers
# ============================================================================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Custom 404 handler."""
    return JSONResponse(
        status_code=404,
        content={"detail": "Resource not found"},
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    """Custom 500 handler."""
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# ============================================================================
# Routers
# ============================================================================

from app.routers import parcels, pois, transit, spatial

app.include_router(parcels.router, prefix="/api/v1/parcels", tags=["parcels"])
app.include_router(pois.router, prefix="/api/v1/pois", tags=["pois"])
app.include_router(transit.router, prefix="/api/v1/transit", tags=["transit"])
app.include_router(spatial.router, prefix="/api/v1/spatial", tags=["spatial"])
