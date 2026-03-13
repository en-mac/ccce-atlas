"""
ccce-atlas Specialty Tiles Service

Slimmed FastAPI service for:
1. AI depth map generation (Mapbox satellite → depth estimation)
2. Elevation proxy (Open Topo Data API)

All other tile serving is handled by pg_tileserv.
"""

from contextlib import asynccontextmanager
from typing import Dict, Optional
import os
import hashlib

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
import httpx
import redis.asyncio as redis
from PIL import Image
import numpy as np
from io import BytesIO

# ============================================================================
# Configuration
# ============================================================================

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DEBUG = os.getenv("DEBUG", "False").lower() == "true"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",")

MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")
OPEN_TOPO_DATA_URL = os.getenv("OPEN_TOPO_DATA_URL", "https://api.opentopodata.org/v1")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/1")

# Cache TTL (1 week for tiles, 1 day for elevation)
TILE_CACHE_TTL = 604800  # 7 days
ELEVATION_CACHE_TTL = 86400  # 1 day

# ============================================================================
# Global Clients
# ============================================================================

redis_client: Optional[redis.Redis] = None
http_client: Optional[httpx.AsyncClient] = None

# ============================================================================
# Lifespan Events
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    global redis_client, http_client

    # Startup
    redis_client = redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=False)
    http_client = httpx.AsyncClient(timeout=30.0)
    print("✓ Redis client initialized")
    print("✓ HTTP client initialized")

    yield

    # Shutdown
    await redis_client.close()
    await http_client.aclose()
    print("✓ Redis client closed")
    print("✓ HTTP client closed")

# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="ccce-atlas Specialty Tiles Service",
    description="AI depth maps and elevation proxy for Corpus Christi civic platform",
    version="1.0.0",
    docs_url="/docs" if DEBUG else None,
    redoc_url="/redoc" if DEBUG else None,
    lifespan=lifespan,
)

# ============================================================================
# Middleware
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Utility Functions
# ============================================================================

def generate_cache_key(prefix: str, *args) -> str:
    """Generate Redis cache key from arguments."""
    key_str = ":".join(str(arg) for arg in args)
    key_hash = hashlib.md5(key_str.encode()).hexdigest()
    return f"{prefix}:{key_hash}"

async def get_cached(key: str) -> Optional[bytes]:
    """Get cached data from Redis."""
    try:
        return await redis_client.get(key)
    except Exception as e:
        print(f"Redis GET error: {e}")
        return None

async def set_cached(key: str, value: bytes, ttl: int) -> None:
    """Set cached data in Redis with TTL."""
    try:
        await redis_client.setex(key, ttl, value)
    except Exception as e:
        print(f"Redis SET error: {e}")

def satellite_to_depth_map(image_data: bytes) -> bytes:
    """
    Convert Mapbox satellite imagery to AI-estimated depth map.

    This is a placeholder implementation. In production, this would use:
    - MiDaS depth estimation model
    - Or custom-trained model for aerial imagery
    - GPU acceleration for inference

    For now, returns a simple grayscale conversion as proof of concept.
    """
    # Load image
    img = Image.open(BytesIO(image_data))

    # Convert to numpy array
    img_array = np.array(img.convert('RGB'))

    # Placeholder: simple grayscale conversion
    # TODO: Replace with actual depth estimation model (MiDaS, etc.)
    grayscale = np.dot(img_array[..., :3], [0.2989, 0.5870, 0.1140])

    # Normalize to 0-255
    depth_normalized = ((grayscale - grayscale.min()) / (grayscale.max() - grayscale.min()) * 255).astype(np.uint8)

    # Convert back to PIL image
    depth_img = Image.fromarray(depth_normalized, mode='L')

    # Save to bytes
    output = BytesIO()
    depth_img.save(output, format='PNG')
    return output.getvalue()

# ============================================================================
# Health Check Endpoint
# ============================================================================

@app.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "ccce-atlas-tiles",
        "environment": ENVIRONMENT,
    }

@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint."""
    return {
        "service": "ccce-atlas Specialty Tiles Service",
        "version": "1.0.0",
        "endpoints": {
            "ai_depth": "/ai-depth/{z}/{x}/{y}",
            "elevation": "/elevation",
        },
    }

# ============================================================================
# AI Depth Map Endpoint
# ============================================================================

@app.get("/ai-depth/{z}/{x}/{y}")
async def get_ai_depth_tile(z: int, x: int, y: int) -> Response:
    """
    Generate AI depth map tile from Mapbox satellite imagery.

    Args:
        z: Zoom level
        x: Tile X coordinate
        y: Tile Y coordinate

    Returns:
        PNG image (grayscale depth map)
    """
    if not MAPBOX_TOKEN:
        raise HTTPException(status_code=500, detail="Mapbox token not configured")

    # Check cache first
    cache_key = generate_cache_key("depth", z, x, y)
    cached = await get_cached(cache_key)
    if cached:
        return Response(content=cached, media_type="image/png")

    # Fetch satellite tile from Mapbox
    mapbox_url = f"https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.png?access_token={MAPBOX_TOKEN}"

    try:
        response = await http_client.get(mapbox_url)
        response.raise_for_status()
        satellite_data = response.content
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch satellite tile: {str(e)}")

    # Generate depth map
    try:
        depth_data = satellite_to_depth_map(satellite_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate depth map: {str(e)}")

    # Cache the result
    await set_cached(cache_key, depth_data, TILE_CACHE_TTL)

    return Response(content=depth_data, media_type="image/png")

# ============================================================================
# Elevation Proxy Endpoint
# ============================================================================

@app.get("/elevation")
async def get_elevation(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    dataset: str = Query("ned10m", description="Elevation dataset (ned10m, srtm30m, etc.)")
) -> Dict:
    """
    Proxy elevation queries to Open Topo Data API.

    Args:
        lat: Latitude
        lon: Longitude
        dataset: Elevation dataset name

    Returns:
        JSON with elevation data
    """
    # Check cache first
    cache_key = generate_cache_key("elevation", dataset, lat, lon)
    cached = await get_cached(cache_key)
    if cached:
        import json
        return json.loads(cached)

    # Query Open Topo Data API
    url = f"{OPEN_TOPO_DATA_URL}/{dataset}?locations={lat},{lon}"

    try:
        response = await http_client.get(url)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch elevation data: {str(e)}")

    # Cache the result
    import json
    await set_cached(cache_key, json.dumps(data).encode(), ELEVATION_CACHE_TTL)

    return data

# ============================================================================
# Batch Elevation Endpoint
# ============================================================================

@app.post("/elevation/batch")
async def get_elevation_batch(
    locations: list[dict],
    dataset: str = Query("ned10m", description="Elevation dataset")
) -> Dict:
    """
    Batch elevation queries (up to 100 locations).

    Args:
        locations: List of {lat, lon} dicts
        dataset: Elevation dataset name

    Returns:
        JSON with elevation data for all locations
    """
    if len(locations) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 locations per batch")

    # Build locations string
    locations_str = "|".join(f"{loc['lat']},{loc['lon']}" for loc in locations)

    # Check cache
    cache_key = generate_cache_key("elevation_batch", dataset, locations_str)
    cached = await get_cached(cache_key)
    if cached:
        import json
        return json.loads(cached)

    # Query Open Topo Data API
    url = f"{OPEN_TOPO_DATA_URL}/{dataset}?locations={locations_str}"

    try:
        response = await http_client.get(url)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch elevation data: {str(e)}")

    # Cache the result
    import json
    await set_cached(cache_key, json.dumps(data).encode(), ELEVATION_CACHE_TTL)

    return data
