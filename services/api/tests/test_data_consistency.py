"""
Data Consistency Tests for CCCE Atlas API

These tests verify that the API returns consistent data across different endpoints.
They catch bugs like the coffee/beaches category issue where one endpoint claims
data exists but another endpoint returns empty results.

Run with: pytest tests/test_data_consistency.py -v
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
# POI Category Consistency (Would catch the coffee/beaches bug)
# ============================================================================

@pytest.mark.asyncio
async def test_poi_categories_match_spatial_search(client):
    """
    CRITICAL: If categories endpoint claims POIs exist, spatial search must find them.

    This test would have caught the coffee/beaches bug where:
    - GET /pois/categories returned {coffee: 4, beaches: 6}
    - GET /spatial/pois/near?category=coffee returned empty []
    """
    # Get all categories with counts
    categories_resp = await client.get("/api/v1/pois/categories")
    assert categories_resp.status_code == 200
    categories = categories_resp.json()["categories"]

    # For each category that claims to have POIs
    issues = []
    for cat in categories:
        category_name = cat["category"]
        claimed_count = cat["count"]

        if claimed_count > 0:
            # Try to find them via spatial search (large radius to cover all of Corpus Christi)
            spatial_resp = await client.get(
                f"/api/v1/spatial/pois/near",
                params={
                    "lat": TEST_LAT,
                    "lon": TEST_LON,
                    "radius_meters": 50000,  # 50km - covers entire city
                    "limit": 500,
                    "category": category_name
                }
            )
            assert spatial_resp.status_code == 200

            actual_count = len(spatial_resp.json()["pois"])

            # If categories claims count > 0, spatial search MUST find at least some
            if actual_count == 0:
                issues.append(
                    f"Category '{category_name}' claims {claimed_count} POIs "
                    f"but spatial search found 0 (radius: 50km)"
                )

    # Report all inconsistencies
    if issues:
        pytest.fail(
            f"❌ POI Category Inconsistencies Found:\n" +
            "\n".join(f"  - {issue}" for issue in issues) +
            "\n\nThis indicates a database sync issue between categories table and POIs table."
        )


@pytest.mark.asyncio
async def test_poi_list_matches_categories(client):
    """
    Verify that listing POIs by category matches category counts.

    This is a secondary check using the /pois/ endpoint instead of spatial search.
    """
    # Get categories
    categories_resp = await client.get("/api/v1/pois/categories")
    categories = categories_resp.json()["categories"]

    issues = []
    for cat in categories:
        category_name = cat["category"]
        claimed_count = cat["count"]

        # Get POIs via list endpoint
        list_resp = await client.get(
            f"/api/v1/pois/",
            params={"category": category_name, "limit": 1000}
        )
        assert list_resp.status_code == 200

        actual_count = list_resp.json()["total"]

        # Counts should match exactly
        if actual_count != claimed_count:
            issues.append(
                f"Category '{category_name}': categories endpoint claims {claimed_count}, "
                f"but list endpoint shows {actual_count}"
            )

    if issues:
        pytest.fail(
            f"❌ POI List/Category Count Mismatches:\n" +
            "\n".join(f"  - {issue}" for issue in issues)
        )


# ============================================================================
# Parcel Owner Consistency
# ============================================================================

@pytest.mark.asyncio
async def test_top_owners_consistency_across_metrics(client):
    """
    Verify that top owners stats are consistent across different sort metrics.

    If an owner appears in top-by-acreage and top-by-count, their parcel_count
    should be identical in both responses.
    """
    # Get top owners by different metrics
    acreage_resp = await client.get("/api/v1/parcels/owners/top?metric=acreage&limit=40")
    count_resp = await client.get("/api/v1/parcels/owners/top?metric=count&limit=40")
    value_resp = await client.get("/api/v1/parcels/owners/top?metric=value&limit=40")

    assert acreage_resp.status_code == 200
    assert count_resp.status_code == 200
    assert value_resp.status_code == 200

    by_acreage = {o["owner"]: o for o in acreage_resp.json()["owners"]}
    by_count = {o["owner"]: o for o in count_resp.json()["owners"]}
    by_value = {o["owner"]: o for o in value_resp.json()["owners"]}

    # Check consistency for owners that appear in multiple lists
    issues = []

    # Compare acreage vs count
    for owner_name in set(by_acreage.keys()) & set(by_count.keys()):
        a = by_acreage[owner_name]
        b = by_count[owner_name]

        if a["parcel_count"] != b["parcel_count"]:
            issues.append(
                f"Owner '{owner_name}': acreage metric shows {a['parcel_count']} parcels, "
                f"count metric shows {b['parcel_count']} parcels"
            )

        if abs(a["total_acres"] - b["total_acres"]) > 0.01:
            issues.append(
                f"Owner '{owner_name}': acreage metric shows {a['total_acres']} acres, "
                f"count metric shows {b['total_acres']} acres"
            )

    # Compare acreage vs value
    for owner_name in set(by_acreage.keys()) & set(by_value.keys()):
        a = by_acreage[owner_name]
        v = by_value[owner_name]

        if a["parcel_count"] != v["parcel_count"]:
            issues.append(
                f"Owner '{owner_name}': acreage metric shows {a['parcel_count']} parcels, "
                f"value metric shows {v['parcel_count']} parcels"
            )

    if issues:
        pytest.fail(
            f"❌ Top Owners Inconsistencies:\n" +
            "\n".join(f"  - {issue}" for issue in issues)
        )


# ============================================================================
# Individual vs List Consistency
# ============================================================================

@pytest.mark.asyncio
async def test_parcel_by_id_matches_list(client):
    """
    Verify that getting a parcel by ID returns the same data as in list results.
    """
    # Get some parcels from list
    list_resp = await client.get("/api/v1/parcels/?limit=10")
    assert list_resp.status_code == 200

    parcels = list_resp.json()["parcels"]
    assert len(parcels) > 0

    issues = []
    for list_parcel in parcels[:5]:  # Check first 5
        parcel_id = list_parcel["parcel_id"]

        # Get same parcel by ID
        by_id_resp = await client.get(f"/api/v1/parcels/{parcel_id}")
        assert by_id_resp.status_code == 200

        by_id_parcel = by_id_resp.json()

        # Compare key fields
        fields_to_check = ["owner", "appraised_value", "market_value", "land_acres", "class_cd"]
        for field in fields_to_check:
            list_val = list_parcel.get(field)
            by_id_val = by_id_parcel.get(field)

            if list_val != by_id_val:
                issues.append(
                    f"Parcel {parcel_id}: list shows {field}={list_val}, "
                    f"by_id shows {field}={by_id_val}"
                )

    if issues:
        pytest.fail(
            f"❌ Parcel List vs By-ID Mismatches:\n" +
            "\n".join(f"  - {issue}" for issue in issues)
        )


@pytest.mark.asyncio
async def test_poi_by_id_matches_list(client):
    """
    Verify that getting a POI by ID returns the same data as in list results.
    """
    # Get some POIs from list
    list_resp = await client.get("/api/v1/pois/?limit=10")
    assert list_resp.status_code == 200

    pois = list_resp.json()["pois"]
    assert len(pois) > 0

    issues = []
    for list_poi in pois[:5]:  # Check first 5
        poi_id = list_poi["poi_id"]

        # Get same POI by ID
        by_id_resp = await client.get(f"/api/v1/pois/{poi_id}")
        assert by_id_resp.status_code == 200

        by_id_poi = by_id_resp.json()

        # Compare key fields
        fields_to_check = ["name", "category", "subcategory", "address", "phone"]
        for field in fields_to_check:
            list_val = list_poi.get(field)
            by_id_val = by_id_poi.get(field)

            if list_val != by_id_val:
                issues.append(
                    f"POI {poi_id}: list shows {field}={list_val}, "
                    f"by_id shows {field}={by_id_val}"
                )

    if issues:
        pytest.fail(
            f"❌ POI List vs By-ID Mismatches:\n" +
            "\n".join(f"  - {issue}" for issue in issues)
        )


# ============================================================================
# Spatial Query Consistency
# ============================================================================

@pytest.mark.asyncio
async def test_spatial_search_vs_point_query(client):
    """
    Verify that POIs returned by point query also appear in nearby search.
    """
    # Get what's at a specific point
    point_resp = await client.get(
        f"/api/v1/spatial/point?lat={TEST_LAT}&lon={TEST_LON}"
    )
    assert point_resp.status_code == 200

    point_data = point_resp.json()
    point_pois = point_data["pois"]

    if len(point_pois) > 0:
        # Get nearby POIs (within 50 meters)
        nearby_resp = await client.get(
            f"/api/v1/spatial/pois/near?lat={TEST_LAT}&lon={TEST_LON}&radius_meters=50&limit=100"
        )
        assert nearby_resp.status_code == 200

        nearby_poi_ids = {poi["poi_id"] for poi in nearby_resp.json()["pois"]}

        # All POIs at point (within 10m) should also appear in nearby search (within 50m)
        missing = []
        for poi in point_pois:
            if poi["poi_id"] not in nearby_poi_ids:
                missing.append(poi["poi_id"])

        if missing:
            pytest.fail(
                f"❌ Point query returned POIs that don't appear in nearby search:\n"
                f"  Missing POI IDs: {missing}\n"
                f"  This indicates spatial index inconsistency."
            )


@pytest.mark.asyncio
async def test_distance_calculation_accuracy(client):
    """
    Verify that distance calculations are reasonable and sorted correctly.
    """
    # Get POIs sorted by distance
    resp = await client.get(
        f"/api/v1/spatial/pois/near?lat={TEST_LAT}&lon={TEST_LON}&radius_meters=5000&limit=20"
    )
    assert resp.status_code == 200

    pois = resp.json()["pois"]

    if len(pois) > 1:
        issues = []

        # Check that distances are sorted (ascending)
        for i in range(len(pois) - 1):
            dist_a = pois[i]["distance_meters"]
            dist_b = pois[i + 1]["distance_meters"]

            if dist_a > dist_b:
                issues.append(
                    f"POIs not sorted by distance: POI {i} is {dist_a}m away, "
                    f"but POI {i+1} is {dist_b}m away (should be ascending)"
                )

        # Check that all distances are within radius
        for poi in pois:
            if poi["distance_meters"] > 5000:
                issues.append(
                    f"POI '{poi['name']}' is {poi['distance_meters']}m away, "
                    f"but radius was 5000m (outside search radius)"
                )

        if issues:
            pytest.fail(
                f"❌ Distance Calculation Issues:\n" +
                "\n".join(f"  - {issue}" for issue in issues)
            )


# ============================================================================
# Count Accuracy
# ============================================================================

@pytest.mark.asyncio
async def test_list_total_matches_actual_count(client):
    """
    Verify that the 'total' field matches the actual number of results.
    """
    # Test parcels list
    parcels_resp = await client.get("/api/v1/parcels/?limit=50&offset=0")
    assert parcels_resp.status_code == 200

    parcels_data = parcels_resp.json()
    claimed_total = parcels_data["total"]
    actual_returned = len(parcels_data["parcels"])

    # If there are fewer results than limit, actual should equal total
    if actual_returned < 50:
        assert actual_returned == claimed_total, (
            f"Parcels: claimed total={claimed_total} but returned {actual_returned} results"
        )

    # Test POIs list
    pois_resp = await client.get("/api/v1/pois/?limit=50&offset=0")
    assert pois_resp.status_code == 200

    pois_data = pois_resp.json()
    claimed_total = pois_data["total"]
    actual_returned = len(pois_data["pois"])

    if actual_returned < 50:
        assert actual_returned == claimed_total, (
            f"POIs: claimed total={claimed_total} but returned {actual_returned} results"
        )


@pytest.mark.asyncio
async def test_pagination_consistency(client):
    """
    Verify that paginating through results doesn't return duplicates or skip items.
    """
    # Get first page
    page1_resp = await client.get("/api/v1/parcels/?limit=10&offset=0")
    page2_resp = await client.get("/api/v1/parcels/?limit=10&offset=10")

    assert page1_resp.status_code == 200
    assert page2_resp.status_code == 200

    page1_ids = {p["parcel_id"] for p in page1_resp.json()["parcels"]}
    page2_ids = {p["parcel_id"] for p in page2_resp.json()["parcels"]}

    # Pages should not have overlapping IDs
    overlap = page1_ids & page2_ids

    if overlap:
        pytest.fail(
            f"❌ Pagination returned duplicate parcels:\n"
            f"  IDs appearing in both page 1 and page 2: {overlap}"
        )


# ============================================================================
# Transit Data Consistency
# ============================================================================

@pytest.mark.asyncio
async def test_transit_stops_belong_to_routes(client):
    """
    Verify that stops returned for a route actually belong to that route.
    """
    # Get all routes
    routes_resp = await client.get("/api/v1/transit/routes")
    assert routes_resp.status_code == 200

    routes = routes_resp.json()["routes"]

    if len(routes) > 0:
        # Check first 3 routes
        issues = []
        for route in routes[:3]:
            route_id = route["route_id"]

            # Get stops for this route
            stops_resp = await client.get(
                f"/api/v1/transit/stops?route_id={route_id}&limit=100"
            )
            assert stops_resp.status_code == 200

            stops = stops_resp.json()["stops"]

            # Verify all stops claim to belong to this route
            for stop in stops:
                if stop["route_id"] != route_id:
                    issues.append(
                        f"Stop {stop['stop_id']} claims route_id={stop['route_id']}, "
                        f"but was returned for route_id={route_id}"
                    )

        if issues:
            pytest.fail(
                f"❌ Transit Stop/Route Mismatches:\n" +
                "\n".join(f"  - {issue}" for issue in issues)
            )


# ============================================================================
# Health Check Data Validation
# ============================================================================

@pytest.mark.asyncio
async def test_detailed_health_check_data_accuracy(client):
    """
    Verify that health check reports accurate data counts.
    """
    health_resp = await client.get("/health/detailed")
    assert health_resp.status_code == 200

    health = health_resp.json()

    # Get actual parcel count
    parcels_resp = await client.get("/api/v1/parcels/?limit=1")
    actual_parcel_count = parcels_resp.json()["total"]

    reported_parcel_count = health["checks"]["database"]["parcel_count"]

    # Should match (or be very close)
    assert reported_parcel_count == actual_parcel_count, (
        f"Health check reports {reported_parcel_count} parcels, "
        f"but parcels endpoint shows {actual_parcel_count}"
    )

    # Get actual route count
    routes_resp = await client.get("/api/v1/transit/routes")
    actual_route_count = routes_resp.json()["total"]

    reported_route_count = health["checks"]["transit"]["route_count"]

    assert reported_route_count == actual_route_count, (
        f"Health check reports {reported_route_count} routes, "
        f"but routes endpoint shows {actual_route_count}"
    )
