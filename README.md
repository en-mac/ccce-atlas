# CCCE Atlas

**Corpus Christi Civic Explorer** - Geospatial platform for exploring Corpus Christi / Nueces County civic data.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Live Deployment

- **Frontend:** https://atlas.ccce.dev
- **API:** https://api.atlas.ccce.dev/docs

## What's Available

Currently deployed on AWS free tier:
- **31 POIs** - beaches, coffee shops, trails, libraries, activities
- **84 transit routes** - CCRTA bus system
- **156K parcels** - property data available (not yet loaded to production)

## Features

- **3D Globe Visualization** - Interactive Cesium.js-powered map
- **Spatial Queries** - Find POIs, parcels, and transit near any point
- **Category Filtering** - Search by POI type (coffee, beaches, trails, etc.)
- **MCP Integration** - Query from AI chat applications

## API Endpoints

**Spatial Queries:**
- `GET /api/v1/spatial/pois/near` - Find POIs near a point (optional `category` filter)
- `GET /api/v1/spatial/parcels/near` - Find parcels near a point
- `GET /api/v1/spatial/point` - Get all data at a location

**Points of Interest:**
- `GET /api/v1/pois/` - List POIs
- `GET /api/v1/pois/categories` - Available categories

**Property Data:**
- `GET /api/v1/parcels/{parcel_id}` - Get parcel details
- `GET /api/v1/parcels/owners/top` - Top landowners

**Transit:**
- `GET /api/v1/transit/routes` - All bus routes
- `GET /api/v1/transit/stops` - All bus stops

Full interactive documentation: https://api.atlas.ccce.dev/docs

## Data Sources

- **Parcels** - Nueces County Appraisal District (156,656 parcels)
- **POIs** - Curated civic amenities (31 locations)
- **Transit** - CCRTA GTFS feed (84 routes)

All data is public domain or properly licensed.

## Tech Stack

- **Frontend:** Cesium.js + vanilla JavaScript
- **Backend:** FastAPI + PostgreSQL/PostGIS + Redis
- **Infrastructure:** Docker + AWS

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built for Corpus Christi** 🌊
