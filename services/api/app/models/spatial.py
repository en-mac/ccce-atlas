"""
Pydantic models for spatial endpoints.
"""

from typing import Optional, Any, Union
from pydantic import BaseModel
from .parcels import Parcel
from .pois import POI


class ParcelNearby(BaseModel):
    """Parcel with distance."""
    id: int
    parcel_id: Optional[str] = None
    owner: Optional[str] = None
    prop_addr: Optional[str] = None
    zip_code: Optional[str] = None
    appraised_value: Optional[float] = None
    market_value: Optional[float] = None
    land_acres: Optional[float] = None
    class_cd: Optional[str] = None
    zoning: Optional[str] = None
    geometry: Any
    distance_meters: float


class POINearby(BaseModel):
    """POI with distance."""
    id: int
    poi_id: str
    name: str
    category: str
    subcategory: Optional[str] = None
    address: Optional[str] = None
    geometry: Any
    distance_meters: float


class NearbyParcels(BaseModel):
    """Nearby parcels result."""
    parcels: list[ParcelNearby]
    center: dict  # {lat, lon}
    radius_meters: float
    total: int


class NearbyPOIs(BaseModel):
    """Nearby POIs result."""
    pois: list[POINearby]
    center: dict  # {lat, lon}
    radius_meters: float
    total: int


class PointQuery(BaseModel):
    """What's at this point result."""
    parcel: Optional[Parcel] = None
    pois: list[POI] = []
    location: dict  # {lat, lon}
