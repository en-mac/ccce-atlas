"""
API Integration Tests for CCCE Atlas

Tests all critical endpoints that would be used by an MCP server.

Run with: pytest tests/test_api.py -v
"""

import pytest
from httpx import AsyncClient
from main import app

# Test coordinates: Downtown Corpus Christi
TEST_LAT = 27.8006
TEST_LON = -97.3964


@pytest.fixture
async def client():
    """Create async test client."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


# ============================================================================
# Health Checks
# ============================================================================

@pytest.mark.asyncio
async def test_basic_health_check(client):
    """Test basic health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ccce-atlas-api"


@pytest.mark.asyncio
async def test_detailed_health_check(client):
    """Test detailed health check with smoke tests."""
    response = await client.get("/health/detailed")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "healthy"
    assert "checks" in data

    # Verify all critical checks pass
    checks = data["checks"]
    assert checks["database"]["status"] == "healthy"
    assert checks["redis"]["status"] == "healthy"
    assert checks["spatial_pois"]["status"] == "healthy"
    assert checks["spatial_parcels"]["status"] == "healthy"
    assert checks["transit"]["status"] == "healthy"
    assert checks["postgis"]["status"] == "healthy"

    # Verify data is loaded
    assert checks["database"]["parcel_count"] > 100000  # Should have 150K+ parcels
    assert checks["transit"]["route_count"] > 50  # Should have 80+ routes


# ============================================================================
# Spatial Queries (Critical for MCP)
# ============================================================================

@pytest.mark.asyncio
async def test_spatial_pois_near_point(client):
    """Test finding POIs near a point."""
    response = await client.get(
        f"/api/v1/spatial/pois/near?lat={TEST_LAT}&lon={TEST_LON}&radius_meters=2000&limit=10"
    )
    assert response.status_code == 200

    data = response.json()
    assert "pois" in data
    assert "total" in data
    assert len(data["pois"]) > 0

    # Verify POI structure
    poi = data["pois"][0]
    assert "name" in poi
    assert "category" in poi
    assert "distance_meters" in poi
    assert poi["distance_meters"] <= 2000  # Within radius


@pytest.mark.asyncio
async def test_spatial_parcels_near_point(client):
    """Test finding parcels near a point."""
    response = await client.get(
        f"/api/v1/spatial/parcels/near?lat={TEST_LAT}&lon={TEST_LON}&radius_meters=500&limit=10"
    )
    assert response.status_code == 200

    data = response.json()
    assert "parcels" in data
    assert "total" in data
    assert len(data["parcels"]) > 0

    # Verify parcel structure
    parcel = data["parcels"][0]
    assert "parcel_id" in parcel  # Can be None
    assert "owner" in parcel  # Can be None
    assert "appraised_value" in parcel
    assert "distance_meters" in parcel
    assert parcel["distance_meters"] <= 500


@pytest.mark.asyncio
async def test_spatial_point_query(client):
    """Test what's at a specific point."""
    response = await client.get(
        f"/api/v1/spatial/point?lat={TEST_LAT}&lon={TEST_LON}"
    )
    assert response.status_code == 200

    data = response.json()
    assert "parcel" in data  # Can be None
    assert "pois" in data
    assert "location" in data
    assert data["location"]["lat"] == TEST_LAT
    assert data["location"]["lon"] == TEST_LON


# ============================================================================
# POI Endpoints
# ============================================================================

@pytest.mark.asyncio
async def test_list_all_pois(client):
    """Test listing POIs."""
    response = await client.get("/api/v1/pois/?limit=50")
    assert response.status_code == 200

    data = response.json()
    assert "pois" in data
    assert "total" in data
    assert len(data["pois"]) > 0
    assert data["total"] > 20  # Should have 30+ POIs


@pytest.mark.asyncio
async def test_filter_pois_by_category(client):
    """Test filtering POIs by category."""
    response = await client.get("/api/v1/pois/?category=coffee")
    assert response.status_code == 200

    data = response.json()
    assert "pois" in data

    # All returned POIs should be coffee category
    for poi in data["pois"]:
        assert poi["category"] == "coffee"


@pytest.mark.asyncio
async def test_get_poi_categories(client):
    """Test getting available POI categories."""
    response = await client.get("/api/v1/pois/categories")
    assert response.status_code == 200

    data = response.json()
    assert "categories" in data
    assert len(data["categories"]) > 5  # Should have 8+ categories

    # Verify expected categories exist
    categories = data["categories"]
    assert any(c["category"] == "coffee" for c in categories)
    assert any(c["category"] == "beaches" for c in categories)


# ============================================================================
# Parcel Endpoints
# ============================================================================

@pytest.mark.asyncio
async def test_get_top_landowners_by_acreage(client):
    """Test getting top landowners by acreage."""
    response = await client.get("/api/v1/parcels/owners/top?metric=acreage&limit=5")
    assert response.status_code == 200

    data = response.json()
    assert "owners" in data
    assert len(data["owners"]) == 5

    # Verify owner structure
    owner = data["owners"][0]
    assert "owner" in owner
    assert "total_acres" in owner
    assert "parcel_count" in owner
    assert owner["total_acres"] > 1000  # Top owner should have 1000+ acres


@pytest.mark.asyncio
async def test_get_top_landowners_by_count(client):
    """Test getting top landowners by parcel count."""
    response = await client.get("/api/v1/parcels/owners/top?metric=count&limit=3")
    assert response.status_code == 200

    data = response.json()
    assert "owners" in data
    assert len(data["owners"]) == 3
    assert data["owners"][0]["parcel_count"] > 100


@pytest.mark.asyncio
async def test_get_top_landowners_by_value(client):
    """Test getting top landowners by total value."""
    response = await client.get("/api/v1/parcels/owners/top?metric=value&limit=3")
    assert response.status_code == 200

    data = response.json()
    assert "owners" in data
    assert len(data["owners"]) == 3
    assert data["owners"][0]["total_value"] > 1000000  # Top should have $1M+


# ============================================================================
# Transit Endpoints
# ============================================================================

@pytest.mark.asyncio
async def test_list_transit_routes(client):
    """Test listing all transit routes."""
    response = await client.get("/api/v1/transit/routes")
    assert response.status_code == 200

    data = response.json()
    assert "routes" in data
    assert "total" in data
    assert len(data["routes"]) > 50  # Should have 80+ route variants

    # Verify route structure
    route = data["routes"][0]
    assert "route_id" in route
    assert "route_name" in route
    assert "route_number" in route


@pytest.mark.asyncio
async def test_list_transit_stops(client):
    """Test listing transit stops."""
    response = await client.get("/api/v1/transit/stops?limit=50")
    assert response.status_code == 200

    data = response.json()
    assert "stops" in data
    assert "total" in data
    assert len(data["stops"]) > 0


# ============================================================================
# Parcel Tiles (Used by Frontend)
# ============================================================================

@pytest.mark.asyncio
async def test_get_parcel_tile(client):
    """Test getting a parcel vector tile."""
    # Downtown Corpus Christi tile at zoom 15
    z, x, y = 15, 7525, 13765

    response = await client.get(f"/api/v1/parcels/tiles/{z}/{x}/{y}.json")
    assert response.status_code == 200

    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert "features" in data
    assert len(data["features"]) > 0

    # Verify GeoJSON structure
    feature = data["features"][0]
    assert feature["type"] == "Feature"
    assert "geometry" in feature
    assert "properties" in feature

    # Geometry should be a dict (not a string)
    assert isinstance(feature["geometry"], dict)
    assert feature["geometry"]["type"] in ["Polygon", "MultiPolygon"]


# ============================================================================
# Error Handling
# ============================================================================

@pytest.mark.asyncio
async def test_invalid_coordinates(client):
    """Test error handling for invalid coordinates."""
    response = await client.get(
        "/api/v1/spatial/pois/near?lat=999&lon=-97.3964&radius_meters=1000"
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_nonexistent_parcel(client):
    """Test getting a parcel that doesn't exist."""
    response = await client.get("/api/v1/parcels/NONEXISTENT")
    assert response.status_code == 404


# ============================================================================
# Performance Tests (Smoke Tests)
# ============================================================================

@pytest.mark.asyncio
async def test_spatial_query_performance(client):
    """Test that spatial queries complete in reasonable time."""
    import time

    start = time.time()
    response = await client.get(
        f"/api/v1/spatial/pois/near?lat={TEST_LAT}&lon={TEST_LON}&radius_meters=5000&limit=100"
    )
    elapsed = time.time() - start

    assert response.status_code == 200
    assert elapsed < 2.0  # Should complete in under 2 seconds


@pytest.mark.asyncio
async def test_tile_generation_performance(client):
    """Test that tile generation completes in reasonable time."""
    import time

    start = time.time()
    response = await client.get("/api/v1/parcels/tiles/14/3762/6878.json")
    elapsed = time.time() - start

    assert response.status_code == 200
    assert elapsed < 3.0  # Should complete in under 3 seconds
