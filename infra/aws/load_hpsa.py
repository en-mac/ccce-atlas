"""
Load the HRSA HPSA Texas GeoJSON into the hrsa_hpsa_tx PostGIS table.

Run on EC2 after schema migration:
    cd ~/ccce-atlas/infra/aws
    DATABASE_URL=... python load_hpsa.py

Source: infra/aws/seed/tx_hpsa.geojson, exported from
HRSA gisportal HealthCareShortage MapServer layer 11 (Primary Care HPSAs,
perimeter polygons) filtered to PRIMARY_STATE_NM='Texas' AND
HPSA_STATUS_DESC='Designated'.

Idempotent — TRUNCATE + INSERT. Stdlib + asyncpg only.
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
GEOJSON_PATH = Path(__file__).parent / "seed" / "tx_hpsa.geojson"


async def load() -> None:
    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(f"GeoJSON not found: {GEOJSON_PATH}")

    print(f"Reading {GEOJSON_PATH} …")
    with GEOJSON_PATH.open() as f:
        fc = json.load(f)
    features = fc.get("features", [])
    print(f"  {len(features):,} HPSA polygons")

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute("TRUNCATE TABLE hrsa_hpsa_tx RESTART IDENTITY")
        print("  cleared hrsa_hpsa_tx")

        insert_sql = """
            INSERT INTO hrsa_hpsa_tx (
                hpsa_source_id, hpsa_name, hpsa_score,
                degree_of_shortage, designation_pop, res_civ_pop, geom
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326))
            )
            ON CONFLICT (hpsa_source_id) DO UPDATE SET
                hpsa_name           = EXCLUDED.hpsa_name,
                hpsa_score          = EXCLUDED.hpsa_score,
                degree_of_shortage  = EXCLUDED.degree_of_shortage,
                designation_pop     = EXCLUDED.designation_pop,
                res_civ_pop         = EXCLUDED.res_civ_pop,
                geom                = EXCLUDED.geom
        """

        total = 0
        async with conn.transaction():
            for feat in features:
                geom = feat.get("geometry")
                if not geom:
                    continue
                p = feat.get("properties") or {}
                await conn.execute(
                    insert_sql,
                    str(p.get("HPSA_SOURCE_ID")) if p.get("HPSA_SOURCE_ID") is not None else None,
                    p.get("HPSA_NM"),
                    int(p["HPSA_SCORE"]) if p.get("HPSA_SCORE") is not None else None,
                    p.get("HPSA_DEGREE_OF_SHORTAGE"),
                    float(p["HPSA_DESIGNATION_POP"]) if p.get("HPSA_DESIGNATION_POP") is not None else None,
                    float(p["HPSA_RES_CIV_POP"]) if p.get("HPSA_RES_CIV_POP") is not None else None,
                    json.dumps(geom),
                )
                total += 1

        await conn.execute("ANALYZE hrsa_hpsa_tx")
        print(f"✓ loaded {total:,} HPSA polygons into hrsa_hpsa_tx")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(load())
