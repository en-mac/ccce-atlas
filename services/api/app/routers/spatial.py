"""
Spatial queries router.

NOTE: All spatial query endpoints have been removed as they are not used by the frontend.
Frontend performs spatial queries directly via tile-based rendering and client-side filtering.

If server-side spatial queries are needed in the future (e.g., "nearby" search,
radius queries), endpoints can be added here.
"""

from fastapi import APIRouter

router = APIRouter()

# No endpoints - Spatial queries handled client-side
