# CCCE Atlas

**Corpus Christi Civic Explorer** - A full-stack geospatial platform for exploring civic data in Corpus Christi / Nueces County, Texas.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Built with Cesium.js, FastAPI, and PostgreSQL + PostGIS.

---

## 🗺️ Overview

CCCE Atlas provides spatial querying and visualization of:
- **156,656 property parcels** with ownership, value, and zoning data
- **31 points of interest** (coffee shops, beaches, parks, museums, etc.)
- **84 public transit routes** (CCRTA bus system)

Perfect for civic engagement, urban planning, and geospatial analysis.

### Live Demo

🚧 *Demo coming soon*

### Screenshots

🚧 *Screenshots coming soon*

---

## ✨ Features

- **3D Globe Visualization** - Cesium.js-powered interactive map
- **Property Data** - Full parcel boundaries with ownership and value
- **Spatial Queries** - Find parcels, POIs, and transit near any point
- **Vector Tiles** - Efficient rendering of large datasets
- **MCP Integration** - Query data from AI chat applications
- **Production Ready** - Docker + AWS deployment

---

## 🏗️ Architecture

```
Frontend (Cesium.js)
    ↓
FastAPI Backend
    ↓
PostgreSQL + PostGIS → Redis Cache
```

### Tech Stack

**Frontend:**
- Cesium.js for 3D globe rendering
- Vanilla JavaScript (no framework overhead)

**Backend:**
- FastAPI (async Python)
- PostgreSQL 15 + PostGIS 3.4
- Redis for caching
- asyncpg for database access

**Infrastructure:**
- Docker Compose for local development
- AWS free tier deployment ready
- Railway.app deployment option

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.11+
- ~1GB disk space

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/YOUR-USERNAME/ccce-atlas.git
cd ccce-atlas

# 2. Set up configuration
cp .env.example .env
cp apps/map/public/js/config.example.js apps/map/public/js/config.js

# 3. Add your Cesium token to config.js
# Get free token from: https://ion.cesium.com/tokens

# 4. Start all services
cd infra
docker compose up -d

# 5. Load data
python scripts/migrate.py

# 6. Open the application
open http://localhost:8080
```

The API will be available at `http://localhost:8000/docs`

---

## 📊 Data Sources

- **Parcels**: Nueces County Appraisal District (156,656 parcels)
- **POIs**: Curated civic amenities
- **Transit**: CCRTA GTFS feed (84 routes)

All data is public domain or properly licensed.

---

## 🤖 MCP Integration

CCCE Atlas can be queried from AI chat applications via MCP (Model Context Protocol).

### Available Tools

1. `search_pois_near_point` - Find coffee shops, beaches, parks near a location
2. `search_parcels_near_point` - Find properties with owner/value data
3. `get_top_landowners` - Top property owners by acreage/count/value
4. `get_transit_routes` - CCRTA bus routes
5. `query_point` - Everything at a specific location
6. `get_poi_categories` - Available POI types

### Setup MCP Server

See [docs/MCP_INTEGRATION_GUIDE.md](docs/MCP_INTEGRATION_GUIDE.md) for complete setup.

Example MCP server implementation: [docs/EXAMPLE_MCP_SERVER.py](docs/EXAMPLE_MCP_SERVER.py)

---

## 🌐 Deployment

### Option 1: AWS Free Tier (Recommended)

Deploy for **$0/month** for 12 months on AWS free tier.

See [docs/DEPLOYMENT_GUIDE_AWS_FREE_TIER.md](docs/DEPLOYMENT_GUIDE_AWS_FREE_TIER.md)

**Resources used:**
- EC2 t3.micro (API + Redis)
- RDS db.t3.micro (PostgreSQL + PostGIS)
- Elastic IP

### Option 2: Railway.app

Deploy for **$10-15/month** with managed infrastructure.

See [docs/DEPLOYMENT_GUIDE_RAILWAY.md](docs/DEPLOYMENT_GUIDE_RAILWAY.md)

### Option 3: Other Options

Compare free and paid hosting options:

See [docs/FREE_DEPLOYMENT_OPTIONS.md](docs/FREE_DEPLOYMENT_OPTIONS.md)

---

## 🧪 Testing

```bash
# Run API tests
cd services/api
pip install -r requirements-dev.txt
pytest -v

# Run health check
curl http://localhost:8000/health/detailed | jq
```

See [services/api/tests/README.md](services/api/tests/README.md) for details.

---

## 📖 API Documentation

When running locally, interactive API docs are available at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Key Endpoints

**Spatial Queries:**
- `GET /api/v1/spatial/pois/near` - Find POIs near a point
- `GET /api/v1/spatial/parcels/near` - Find parcels near a point
- `GET /api/v1/spatial/point` - Get all data at a location

**Property Data:**
- `GET /api/v1/parcels/{parcel_id}` - Get parcel details
- `GET /api/v1/parcels/owners/top` - Top landowners

**Points of Interest:**
- `GET /api/v1/pois/` - List POIs
- `GET /api/v1/pois/categories` - Available categories

**Transit:**
- `GET /api/v1/transit/routes` - All bus routes
- `GET /api/v1/transit/stops` - All bus stops

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Install development dependencies
cd services/api
pip install -r requirements-dev.txt

# Run tests
pytest -v

# Run linter
flake8

# Format code
black .
```

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Nueces County Appraisal District** - Property data
- **CCRTA** - Transit data
- **Cesium** - 3D mapping platform
- **PostGIS** - Spatial database extensions

---

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

**Built for Corpus Christi** 🌊

*Empowering civic engagement through open data and technology*
