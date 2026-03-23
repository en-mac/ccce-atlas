"""
POIs (Points of Interest) router.

NOTE: POIs are currently served from static GeoJSON files in /data directory.
No API endpoints are actively used by the frontend.

If dynamic POI management is needed in the future, endpoints can be added here.
"""

from fastapi import APIRouter

router = APIRouter()

# No endpoints - POIs loaded from static files
