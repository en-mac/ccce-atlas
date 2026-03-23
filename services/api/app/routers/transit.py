"""
Transit router.

NOTE: Transit routes and stops are currently served from static JSON/GeoJSON files.
No API endpoints are actively used by the frontend.

If dynamic transit data or real-time updates are needed, endpoints can be added here.
"""

from fastapi import APIRouter

router = APIRouter()

# No endpoints - Transit data loaded from static files
