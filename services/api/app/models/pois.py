"""
Pydantic models for POI endpoints.
"""

from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel


class POIBase(BaseModel):
    """Base POI fields."""
    poi_id: str
    name: str
    category: str
    subcategory: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    hours: Optional[str] = None


class POI(POIBase):
    """Full POI response with geometry."""
    id: int
    geometry: Any  # GeoJSON object
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class POIList(BaseModel):
    """Paginated list of POIs."""
    pois: list[POI]
    total: int
    limit: int
    offset: int


class CategoryCount(BaseModel):
    """POI category with count."""
    category: str
    count: int


class Categories(BaseModel):
    """List of POI categories."""
    categories: list[CategoryCount]
