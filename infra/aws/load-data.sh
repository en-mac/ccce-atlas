#!/bin/bash
#
# Data Loading Script for CCCE Atlas
# Run this on EC2 to load data into RDS
#
# Usage: bash load-data.sh
#

set -e

echo "======================================"
echo "CCCE Atlas - Data Migration"
echo "======================================"
echo ""

# Install Python dependencies
echo "→ Installing Python dependencies..."
pip3 install --user asyncpg httpx tqdm

# Set database URL from .env.production
echo "→ Loading database configuration..."
cd /home/ec2-user/ccce-atlas/infra/aws
source .env.production

# Run migration
echo "→ Starting data migration..."
cd /home/ec2-user/ccce-atlas/infra/scripts

# Export DATABASE_URL for the migration script
export DATABASE_URL

# Run migration with all data
python3 migrate.py --all

echo ""
echo "======================================"
echo "✅ Data Migration Complete!"
echo "======================================"
echo ""
echo "Your API now has:"
echo "  - 156,656 parcels"
echo "  - 31 POIs (beaches, coffee shops, etc.)"
echo "  - 84 transit routes"
echo "  - Transit stops"
echo "  - School districts"
echo ""
echo "Test it:"
echo "  curl https://api.atlas.ccce.dev/api/v1/spatial/pois/near?lat=27.8006&lon=-97.3964&radius_miles=1"
echo ""
