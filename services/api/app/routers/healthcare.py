"""
Healthcare router — Medicare provider anomaly layer for the atlas Healthcare tab.

Data is sourced from CompIntel's gold/anomaly_ensemble + NPPES, geocoded and
loaded by infra/aws/load_healthcare.py. See compintel/scripts/build_atlas_handoff.py
for the upstream ETL.

Endpoints:
    GET /api/v1/healthcare/providers/nueces?year=YYYY
        GeoJSON FeatureCollection of every Nueces NPI scored in CompIntel for
        the given year. Properties: npi, specialty, tier, ensemble_score,
        med_mdcr_stdzd_amt, tot_benes.

    GET /api/v1/healthcare/providers/{npi}
        Full year-by-year trajectory for one NPI (for the right-panel card).
"""

from fastapi import APIRouter, HTTPException, Query

from app.db.cache import redis_cache
from app.db.connection import database_pool
from app.db.queries import healthcare as queries
from app.models.healthcare import (
    HealthcareProviderFeatureCollection,
    ProviderCard,
    ProviderYearRow,
)

router = APIRouter()

ALLOWED_YEARS = {2020, 2021, 2022, 2023}


@router.get(
    "/providers/nueces",
    response_model=HealthcareProviderFeatureCollection,
)
async def get_nueces_providers(
    year: int = Query(2023, ge=2020, le=2023),
):
    """Every Nueces NPI for one year as GeoJSON points."""
    if year not in ALLOWED_YEARS:
        raise HTTPException(status_code=400, detail=f"year must be one of {sorted(ALLOWED_YEARS)}")

    cache_key = redis_cache.generate_key("healthcare:nueces", str(year))
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(queries.GET_NUECES_FOR_YEAR, year)

    features = []
    for r in rows:
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(r["lon"]), float(r["lat"])]},
                "properties": {
                    "npi": int(r["npi"]),
                    "specialty": r["specialty"],
                    "tier": r["tier"],
                    "ensemble_score": float(r["ensemble_score"]) if r["ensemble_score"] is not None else None,
                    "med_mdcr_stdzd_amt": float(r["med_mdcr_stdzd_amt"]) if r["med_mdcr_stdzd_amt"] is not None else None,
                    "tot_benes": float(r["tot_benes"]) if r["tot_benes"] is not None else None,
                },
            }
        )

    result = {"type": "FeatureCollection", "year": year, "features": features}
    # Cache for a day; data refreshes are quarterly at most.
    await redis_cache.set(cache_key, result, ttl=86400)
    return result


@router.get("/providers/{npi}", response_model=ProviderCard)
async def get_provider(npi: int):
    """All-years trajectory for one NPI."""
    cache_key = redis_cache.generate_key("healthcare:provider", str(npi))
    cached = await redis_cache.get(cache_key)
    if cached:
        return cached

    pool = database_pool.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(queries.GET_PROVIDER_BY_NPI, npi)

    if not rows:
        raise HTTPException(status_code=404, detail=f"NPI {npi} not found")

    first = rows[0]
    years = [
        ProviderYearRow(
            year=int(r["year"]),
            specialty=r["specialty"],
            tier=r["tier"],
            ensemble_score=float(r["ensemble_score"]) if r["ensemble_score"] is not None else None,
            iqr_score=float(r["iqr_score"]) if r["iqr_score"] is not None else None,
            iforest_score=float(r["iforest_score"]) if r["iforest_score"] is not None else None,
            lgbm_residual=float(r["lgbm_residual"]) if r["lgbm_residual"] is not None else None,
            med_mdcr_stdzd_amt=float(r["med_mdcr_stdzd_amt"]) if r["med_mdcr_stdzd_amt"] is not None else None,
            tot_benes=float(r["tot_benes"]) if r["tot_benes"] is not None else None,
        )
        for r in rows
    ]

    result = ProviderCard(
        npi=int(first["npi"]),
        lon=float(first["lon"]),
        lat=float(first["lat"]),
        years=years,
    ).model_dump()
    await redis_cache.set(cache_key, result, ttl=86400)
    return result
