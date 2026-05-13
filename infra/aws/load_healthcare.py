"""
Load the CompIntel handoff GeoJSON into the healthcare_providers PostGIS table.

Run on EC2 after schema migration:
    cd ~/ccce-atlas/infra/aws
    DATABASE_URL=... python load_healthcare.py

Source: infra/aws/seed/nueces_providers.geojson (committed in repo, shipped
by the deploy rsync). Upstream generator: compintel/scripts/build_atlas_handoff.py.

Idempotent — TRUNCATE + bulk INSERT every run. Uses only stdlib + asyncpg
(both already in services/api/requirements.txt), so it can run in the API
container or anywhere with Python 3.11+ and asyncpg installed.
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/ccce_atlas",
)
GEOJSON_PATH = Path(__file__).parent / "seed" / "nueces_providers.geojson"


async def load() -> None:
    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(f"GeoJSON not found: {GEOJSON_PATH}")

    print(f"Reading {GEOJSON_PATH} …")
    with GEOJSON_PATH.open() as f:
        fc = json.load(f)
    features = fc.get("features", [])
    print(f"  {len(features):,} features")

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute("TRUNCATE TABLE healthcare_providers RESTART IDENTITY")
        print("  cleared healthcare_providers")

        insert_sql = """
            INSERT INTO healthcare_providers (
                npi, year, specialty, tier,
                ensemble_score, iqr_score, iforest_score, lgbm_residual,
                med_mdcr_stdzd_amt, tot_benes, geom
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7, $8,
                $9, $10,
                ST_SetSRID(ST_MakePoint($11, $12), 4326)
            )
            ON CONFLICT (npi, year) DO UPDATE SET
                specialty           = EXCLUDED.specialty,
                tier                = EXCLUDED.tier,
                ensemble_score      = EXCLUDED.ensemble_score,
                iqr_score           = EXCLUDED.iqr_score,
                iforest_score       = EXCLUDED.iforest_score,
                lgbm_residual       = EXCLUDED.lgbm_residual,
                med_mdcr_stdzd_amt  = EXCLUDED.med_mdcr_stdzd_amt,
                tot_benes           = EXCLUDED.tot_benes,
                geom                = EXCLUDED.geom
        """

        total = 0
        async with conn.transaction():
            for feat in features:
                geom = feat.get("geometry") or {}
                coords = geom.get("coordinates") or []
                if len(coords) != 2:
                    continue
                lon, lat = coords[0], coords[1]
                p = feat.get("properties") or {}

                await conn.execute(
                    insert_sql,
                    int(p["npi"]),
                    int(p["year"]),
                    p.get("specialty"),
                    p.get("tier"),
                    p.get("ensemble_score"),
                    p.get("iqr_score"),
                    p.get("iforest_score"),
                    p.get("lgbm_residual"),
                    float(p["med_mdcr_stdzd_amt"]) if p.get("med_mdcr_stdzd_amt") is not None else None,
                    float(p["tot_benes"]) if p.get("tot_benes") is not None else None,
                    float(lon),
                    float(lat),
                )
                total += 1

        await conn.execute("ANALYZE healthcare_providers")
        print(f"✓ loaded {total:,} npi-year rows into healthcare_providers")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(load())
