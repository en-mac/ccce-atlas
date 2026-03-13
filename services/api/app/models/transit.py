"""
Pydantic models for transit endpoints.
"""

from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel


class RouteBase(BaseModel):
    """Base route fields."""
    route_id: str
    route_name: Optional[str] = None
    route_number: Optional[str] = None
    route_color: Optional[str] = None
    route_type: Optional[str] = None
    description: Optional[str] = None


class Route(RouteBase):
    """Full route response with geometry."""
    id: int
    geometry: Any  # GeoJSON object
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Routes(BaseModel):
    """List of routes."""
    routes: list[Route]
    total: int


class StopBase(BaseModel):
    """Base stop fields."""
    stop_id: str
    stop_name: Optional[str] = None
    route_id: str
    stop_sequence: Optional[int] = None
    direction: Optional[str] = None


class Stop(StopBase):
    """Full stop response with geometry."""
    id: int
    geometry: Any  # GeoJSON object
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Stops(BaseModel):
    """List of stops."""
    stops: list[Stop]
    total: int
