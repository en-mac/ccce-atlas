import asyncio
import json
import os
from pathlib import Path
import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL")
DATA_DIR = Path("/home/ec2-user/ccce-platform/apps/map/public/data")

async def load_pois():
    conn = await asyncpg.connect(DATABASE_URL)

    print("Loading POIs...")
    await conn.execute("TRUNCATE TABLE pois RESTART IDENTITY CASCADE")

    categories = ["beaches", "trails", "eats", "coffee", "bookstores", "libraries", "activities", "community"]
    total = 0

    for category in categories:
        file_path = DATA_DIR / f"{category}.geojson"
        if not file_path.exists():
            continue

        with open(file_path) as f:
            geojson = json.load(f)

        for idx, feature in enumerate(geojson.get("features", [])):
            props = feature.get("properties", {})
            geom = feature.get("geometry")
            if not geom:
                continue

            await conn.execute("""
                INSERT INTO pois (poi_id, name, category, subcategory, address, geom)
                VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6))
            """,
                props.get("id") or f"{category}_{idx}",
                props.get("name") or props.get("NAME"),
                category,
                props.get("subcategory") or props.get("type"),
                props.get("address") or props.get("ADDRESS"),
                json.dumps(geom)
            )
            total += 1

    print(f"✓ Loaded {total} POIs")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(load_pois())
