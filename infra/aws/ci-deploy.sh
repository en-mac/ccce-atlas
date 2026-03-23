#!/bin/bash
#
# CI/CD Deployment Script for EC2
# This script runs on the EC2 instance via GitHub Actions
#

set -e

echo "======================================"
echo "Starting deployment..."
echo "======================================"

# Navigate to project directory
cd ~ || exit 1

# Ensure GitHub is in known_hosts (required for SSH git operations)
mkdir -p ~/.ssh
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null || true

# Pull latest code
if [ -d "ccce-atlas/.git" ]; then
  echo "→ Updating existing repository..."
  cd ccce-atlas
  # Clean any generated files (excluding .git directory)
  sudo find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

  # Ensure remote uses SSH (not HTTPS) for authentication with deploy keys
  CURRENT_URL=$(git remote get-url origin)
  if [[ "$CURRENT_URL" == https://* ]]; then
    echo "→ Converting remote URL from HTTPS to SSH..."
    git remote set-url origin git@github.com:en-mac/ccce-atlas.git
  fi

  # Pull latest
  git fetch origin
  git reset --hard origin/main
else
  echo "→ Cloning repository (fresh install)..."
  # Remove directory with sudo if needed (Docker creates root-owned files)
  sudo rm -rf ccce-atlas 2>/dev/null || rm -rf ccce-atlas 2>/dev/null || true
  git clone git@github.com:en-mac/ccce-atlas.git
  cd ccce-atlas
fi

# Navigate to docker-compose directory
cd infra/aws

# Check if .env.production exists
if [ ! -f .env.production ]; then
  echo "❌ Error: .env.production not found!"
  echo "Please create it on the EC2 instance with your database credentials"
  exit 1
fi

# Stop existing containers
echo "→ Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down || true

# Pull/rebuild images
echo "→ Building new images..."
docker-compose -f docker-compose.prod.yml build --no-cache

# Start services
echo "→ Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Deploy frontend to nginx (serves from /var/www/atlas.ccce.dev)
echo "→ Deploying frontend..."
NGINX_ROOT="/var/www/atlas.ccce.dev"

if cp -r ~/ccce-atlas/apps/map/public/* $NGINX_ROOT/ 2>/dev/null; then
    echo "✅ Frontend files copied to $NGINX_ROOT"

    # Note: config.js is gitignored and must be manually uploaded once to production
    # It contains the Cesium token and should already exist at $NGINX_ROOT/js/config.js
    if [ ! -f "$NGINX_ROOT/js/config.js" ]; then
        echo "⚠️  WARNING: config.js not found! Upload it manually with:"
        echo "   scp apps/map/public/js/config.js ec2-user@<host>:$NGINX_ROOT/js/"
    fi

    # Deploy nginx configuration
    if sudo cp ~/ccce-atlas/apps/map/nginx.conf /etc/nginx/sites-available/atlas.ccce.dev 2>/dev/null; then
        echo "✅ Nginx config deployed to /etc/nginx/sites-available/atlas.ccce.dev"
    else
        echo "⚠️  Nginx config deployment skipped (no sudo or file already correct)"
    fi

    # Reload nginx
    if sudo systemctl reload nginx 2>/dev/null; then
        echo "✅ Nginx reloaded"
    else
        echo "⚠️  Nginx reload skipped (no sudo)"
    fi
else
    echo "❌ Frontend deployment failed - permission denied"
    echo "Run on EC2: sudo chown -R \$USER:nginx $NGINX_ROOT && sudo chmod -R 775 $NGINX_ROOT"
    exit 1
fi

# Wait for services to be healthy
echo "→ Waiting for services to start..."
sleep 5

# Check health
echo "→ Checking service health..."
docker-compose -f docker-compose.prod.yml ps

# Verify API is responding
for i in {1..30}; do
  if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ API is healthy!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ API failed to start"
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
  fi
  echo "Waiting for API... ($i/30)"
  sleep 2
done

# Cleanup old images
echo "→ Cleaning up old Docker images..."
docker image prune -f

echo ""
echo "======================================"
echo "✅ Deployment complete!"
echo "======================================"
echo "API: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8000"
echo ""
