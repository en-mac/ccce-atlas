"""
Data Consistency Tests for CCCE Atlas API (Live Production Tests)

These tests run against the production API to verify data consistency.

Run with: pytest tests/test_data_consistency_live.py -v
"""

import os

import pytest
import httpx

# API under test. Override via ATLAS_API_URL env var (e.g. the production endpoint).
BASE_URL = os.environ.get("ATLAS_API_URL", "http://localhost:8000")

# Test coordinates: Downtown Corpus Christi
TEST_LAT = 27.8006
TEST_LON = -97.3964


@pytest.mark.asyncio
async def test_poi_categories_match_spatial_search():
    """
    CRITICAL: If categories endpoint claims POIs exist, spatial search must find them.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get all categories with counts
        categories_resp = await client.get(f"{BASE_URL}/api/v1/pois/categories")
        assert categories_resp.status_code == 200
        categories = categories_resp.json()["categories"]

        # For each category that claims to have POIs
        issues = []
        for cat in categories:
            category_name = cat["category"]
            claimed_count = cat["count"]

            if claimed_count > 0:
                # Try to find them via spatial search
                spatial_resp = await client.get(
                    f"{BASE_URL}/api/v1/spatial/pois/near",
                    params={
                        "lat": TEST_LAT,
                        "lon": TEST_LON,
                        "radius_meters": 50000,
                        "limit": 500,
                        "category": category_name
                    }
                )
                assert spatial_resp.status_code == 200

                actual_count = len(spatial_resp.json()["pois"])

                if actual_count == 0:
                    issues.append(
                        f"Category '{category_name}' claims {claimed_count} POIs "
                        f"but spatial search found 0 (radius: 50km)"
                    )

        if issues:
            pytest.fail(
                f"❌ POI Category Inconsistencies Found:\n" +
                "\n".join(f"  - {issue}" for issue in issues)
            )


@pytest.mark.asyncio
async def test_poi_list_matches_categories():
    """Verify that listing POIs by category matches category counts."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        categories_resp = await client.get(f"{BASE_URL}/api/v1/pois/categories")
        categories = categories_resp.json()["categories"]

        issues = []
        for cat in categories:
            category_name = cat["category"]
            claimed_count = cat["count"]

            list_resp = await client.get(
                f"{BASE_URL}/api/v1/pois/",
                params={"category": category_name, "limit": 1000}
            )
            assert list_resp.status_code == 200

            actual_count = list_resp.json()["total"]

            if actual_count != claimed_count:
                issues.append(
                    f"Category '{category_name}': categories claims {claimed_count}, "
                    f"list shows {actual_count}"
                )

        if issues:
            pytest.fail(
                f"❌ POI List/Category Mismatches:\n" +
                "\n".join(f"  - {issue}" for issue in issues)
            )


@pytest.mark.asyncio
async def test_top_owners_consistency_across_metrics():
    """Verify top owners stats are consistent across metrics."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        acreage_resp = await client.get(f"{BASE_URL}/api/v1/parcels/owners/top?metric=acreage&limit=40")
        count_resp = await client.get(f"{BASE_URL}/api/v1/parcels/owners/top?metric=count&limit=40")

        assert acreage_resp.status_code == 200
        assert count_resp.status_code == 200

        by_acreage = {o["owner"]: o for o in acreage_resp.json()["owners"]}
        by_count = {o["owner"]: o for o in count_resp.json()["owners"]}

        issues = []
        for owner_name in set(by_acreage.keys()) & set(by_count.keys()):
            a = by_acreage[owner_name]
            b = by_count[owner_name]

            if a["parcel_count"] != b["parcel_count"]:
                issues.append(
                    f"Owner '{owner_name}': acreage metric shows {a['parcel_count']} parcels, "
                    f"count metric shows {b['parcel_count']} parcels"
                )

        if issues:
            pytest.fail(
                f"❌ Top Owners Inconsistencies:\n" +
                "\n".join(f"  - {issue}" for issue in issues)
            )


@pytest.mark.asyncio
async def test_parcel_by_id_matches_list():
    """Verify getting parcel by ID returns same data as list."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        list_resp = await client.get(f"{BASE_URL}/api/v1/parcels/?limit=10")
        assert list_resp.status_code == 200

        parcels = list_resp.json()["parcels"]
        assert len(parcels) > 0

        issues = []
        for list_parcel in parcels[:5]:
            parcel_id = list_parcel["parcel_id"]

            by_id_resp = await client.get(f"{BASE_URL}/api/v1/parcels/{parcel_id}")
            assert by_id_resp.status_code == 200

            by_id_parcel = by_id_resp.json()

            fields_to_check = ["owner", "appraised_value", "market_value", "land_acres"]
            for field in fields_to_check:
                if list_parcel.get(field) != by_id_parcel.get(field):
                    issues.append(
                        f"Parcel {parcel_id}: {field} mismatch"
                    )

        if issues:
            pytest.fail(f"❌ Mismatches:\n" + "\n".join(f"  - {issue}" for issue in issues))


@pytest.mark.asyncio
async def test_poi_by_id_matches_list():
    """Verify getting POI by ID returns same data as list."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        list_resp = await client.get(f"{BASE_URL}/api/v1/pois/?limit=10")
        assert list_resp.status_code == 200

        pois = list_resp.json()["pois"]
        assert len(pois) > 0

        issues = []
        for list_poi in pois[:5]:
            poi_id = list_poi["poi_id"]

            by_id_resp = await client.get(f"{BASE_URL}/api/v1/pois/{poi_id}")
            assert by_id_resp.status_code == 200

            by_id_poi = by_id_resp.json()

            fields_to_check = ["name", "category", "address"]
            for field in fields_to_check:
                if list_poi.get(field) != by_id_poi.get(field):
                    issues.append(f"POI {poi_id}: {field} mismatch")

        if issues:
            pytest.fail(f"❌ Mismatches:\n" + "\n".join(f"  - {issue}" for issue in issues))


@pytest.mark.asyncio
async def test_distance_calculation_accuracy():
    """Verify distances are sorted and within radius."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{BASE_URL}/api/v1/spatial/pois/near",
            params={"lat": TEST_LAT, "lon": TEST_LON, "radius_meters": 5000, "limit": 20}
        )
        assert resp.status_code == 200

        pois = resp.json()["pois"]

        if len(pois) > 1:
            issues = []

            # Check sorted
            for i in range(len(pois) - 1):
                if pois[i]["distance_meters"] > pois[i + 1]["distance_meters"]:
                    issues.append("POIs not sorted by distance")
                    break

            # Check within radius
            for poi in pois:
                if poi["distance_meters"] > 5000:
                    issues.append(f"POI '{poi['name']}' is {poi['distance_meters']}m away (exceeds 5000m)")

            if issues:
                pytest.fail(f"❌ Issues:\n" + "\n".join(f"  - {issue}" for issue in issues))


@pytest.mark.asyncio
async def test_pagination_consistency():
    """Verify pagination doesn't return duplicates."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        page1_resp = await client.get(f"{BASE_URL}/api/v1/parcels/?limit=10&offset=0")
        page2_resp = await client.get(f"{BASE_URL}/api/v1/parcels/?limit=10&offset=10")

        assert page1_resp.status_code == 200
        assert page2_resp.status_code == 200

        page1_ids = {p["parcel_id"] for p in page1_resp.json()["parcels"]}
        page2_ids = {p["parcel_id"] for p in page2_resp.json()["parcels"]}

        overlap = page1_ids & page2_ids

        if overlap:
            pytest.fail(f"❌ Duplicate parcels in pagination: {overlap}")


@pytest.mark.asyncio
async def test_transit_stops_belong_to_routes():
    """Verify stops belong to their claimed routes."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        routes_resp = await client.get(f"{BASE_URL}/api/v1/transit/routes")
        assert routes_resp.status_code == 200

        routes = routes_resp.json()["routes"]

        if len(routes) > 0:
            issues = []
            for route in routes[:3]:
                route_id = route["route_id"]

                stops_resp = await client.get(
                    f"{BASE_URL}/api/v1/transit/stops",
                    params={"route_id": route_id, "limit": 100}
                )
                assert stops_resp.status_code == 200

                stops = stops_resp.json()["stops"]

                for stop in stops:
                    if stop["route_id"] != route_id:
                        issues.append(f"Stop {stop['stop_id']} claims wrong route")

            if issues:
                pytest.fail(f"❌ Issues:\n" + "\n".join(f"  - {issue}" for issue in issues))


@pytest.mark.asyncio
async def test_detailed_health_check_data_accuracy():
    """Verify health check counts match actual data."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        health_resp = await client.get(f"{BASE_URL}/health/detailed")
        assert health_resp.status_code == 200

        health = health_resp.json()

        # Check parcel count
        parcels_resp = await client.get(f"{BASE_URL}/api/v1/parcels/?limit=1")
        actual_parcel_count = parcels_resp.json()["total"]

        reported_parcel_count = health["checks"]["database"]["parcel_count"]

        assert reported_parcel_count == actual_parcel_count, (
            f"Health check reports {reported_parcel_count} parcels, "
            f"actual is {actual_parcel_count}"
        )

        # Check route count
        routes_resp = await client.get(f"{BASE_URL}/api/v1/transit/routes")
        actual_route_count = routes_resp.json()["total"]

        reported_route_count = health["checks"]["transit"]["route_count"]

        assert reported_route_count == actual_route_count, (
            f"Health check reports {reported_route_count} routes, "
            f"actual is {actual_route_count}"
        )
