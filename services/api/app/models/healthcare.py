"""
Pydantic models for healthcare endpoints.

Wraps the CompIntel handoff: per-NPI Medicare anomaly scores for
individual practitioners with a Nueces County practice address.
"""
from typing import Any, List, Optional

from pydantic import BaseModel


class HealthcareProviderFeature(BaseModel):
    """Single NPI-year as a GeoJSON Feature."""

    type: str = "Feature"
    geometry: Any  # GeoJSON Point
    properties: dict


class HealthcareProviderFeatureCollection(BaseModel):
    """GeoJSON FeatureCollection for one year."""

    type: str = "FeatureCollection"
    year: int
    features: List[HealthcareProviderFeature]


class ProviderYearRow(BaseModel):
    """One row of an NPI's year-by-year trajectory."""

    year: int
    specialty: Optional[str] = None
    tier: Optional[str] = None
    ensemble_score: Optional[float] = None
    iqr_score: Optional[float] = None
    iforest_score: Optional[float] = None
    lgbm_residual: Optional[float] = None
    med_mdcr_stdzd_amt: Optional[float] = None
    tot_benes: Optional[float] = None
    med_wrvu_visible: Optional[float] = None
    dollars_per_wrvu: Optional[float] = None


class ProviderCard(BaseModel):
    """All-years card for a single NPI, used by the atlas right-side info panel."""

    npi: int
    lon: float
    lat: float
    years: List[ProviderYearRow]
