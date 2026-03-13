"""
Pydantic models for parcel endpoints.
"""

from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class ParcelBase(BaseModel):
    """Base parcel fields."""
    parcel_id: str
    owner: Optional[str] = None
    prop_addr: Optional[str] = None
    zip_code: Optional[str] = None
    appraised_value: Optional[float] = None
    market_value: Optional[float] = None
    land_acres: Optional[float] = None
    class_cd: Optional[str] = None
    year_built: Optional[int] = None
    zoning: Optional[str] = None
    prop_type: Optional[str] = None


class Parcel(ParcelBase):
    """Full parcel response with geometry."""
    id: int
    objectid: Optional[int] = None
    geometry: Any  # GeoJSON object
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ParcelList(BaseModel):
    """Paginated list of parcels."""
    parcels: list[Parcel]
    total: int
    limit: int
    offset: int


class OwnerStats(BaseModel):
    """Top owner statistics."""
    owner: str
    parcel_count: int
    total_acres: float
    total_appraised_value: Optional[float] = None
    total_market_value: Optional[float] = None
    avg_appraised_value: Optional[float] = None


class TopOwners(BaseModel):
    """Top owners response."""
    owners: list[OwnerStats]
    metric: str
    limit: int


class ParcelIntersection(Parcel):
    """Parcel with intersection area."""
    intersection_area: float


class SpatialIntersectionResult(BaseModel):
    """Parcels intersecting a geometry."""
    parcels: list[ParcelIntersection]
    total: int
