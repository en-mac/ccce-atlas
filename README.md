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

## Features

- **3D Globe Visualization** - Interactive Cesium.js-powered map
- **Spatial Queries** - Find POIs and transit near any point
- **Category Filtering** - Search by POI type (coffee, beaches, trails, etc.)
- **MCP Integration** - Query from AI chat applications

## API Endpoints

**Spatial Queries:**
- `GET /api/v1/spatial/pois/near` - Find POIs near a point (optional `category` filter)

**Points of Interest:**
- `GET /api/v1/pois/` - List POIs
- `GET /api/v1/pois/categories` - Available categories

**Transit:**
- `GET /api/v1/transit/routes` - All bus routes
- `GET /api/v1/transit/stops` - All bus stops

Full interactive documentation: https://api.atlas.ccce.dev/docs

## Data Sources

- **POIs** - Curated civic amenities (31 locations)
- **Transit** - CCRTA GTFS feed (84 routes)

All data is public domain or properly licensed.

## Tech Stack

- **Frontend:** Cesium.js + vanilla JavaScript
- **Backend:** FastAPI + PostgreSQL/PostGIS + Redis
- **Infrastructure:** Docker + AWS

## Work in Progress

- **Parcels** - Property data integration (156K parcels from Nueces County Appraisal District) is currently under development

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built for Corpus Christi** 🌊
