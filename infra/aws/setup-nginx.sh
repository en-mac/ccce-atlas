#!/bin/bash
#
# Nginx + SSL Setup Script for CCCE Atlas
# Run this on EC2 after the application is deployed
#
# Usage: sudo bash setup-nginx.sh YOUR_EMAIL@example.com
#

set -e

if [ -z "$1" ]; then
    echo "Error: Email address required for Let's Encrypt"
    echo "Usage: sudo bash setup-nginx.sh your-email@example.com"
    exit 1
fi

EMAIL="$1"

echo "======================================"
echo "CCCE Atlas - Nginx + SSL Setup"
echo "======================================"
echo ""
echo "Email for Let's Encrypt: $EMAIL"
echo "Domains: atlas.ccce.dev, api.atlas.ccce.dev"
echo ""

# Install nginx
echo "→ Installing nginx..."
yum install nginx -y

# Install certbot for Let's Encrypt
echo "→ Installing certbot..."
yum install certbot python3-certbot-nginx -y

# Create temporary nginx config (for certbot verification)
echo "→ Creating initial nginx configuration..."
cat > /etc/nginx/conf.d/ccce-atlas.conf << 'EOF'
# Temporary config for SSL certificate generation
server {
    listen 80;
    server_name atlas.ccce.dev api.atlas.ccce.dev;

    location /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
    }

    location / {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
EOF

# Start nginx
echo "→ Starting nginx..."
systemctl start nginx
systemctl enable nginx

# Wait for DNS to propagate
echo "→ Waiting 10 seconds for DNS to propagate..."
sleep 10

# Get SSL certificates
echo "→ Obtaining SSL certificates..."
certbot certonly \
    --nginx \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d atlas.ccce.dev \
    -d api.atlas.ccce.dev

# Create final nginx configuration with SSL
echo "→ Creating production nginx configuration..."
cat > /etc/nginx/conf.d/ccce-atlas.conf << 'EOF'
# API subdomain (api.atlas.ccce.dev)
server {
    listen 80;
    server_name api.atlas.ccce.dev;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.atlas.ccce.dev;

    ssl_certificate /etc/letsencrypt/live/atlas.ccce.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/atlas.ccce.dev/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers for MCP access
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type, Authorization";

        # Handle preflight requests
        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}

# Main domain (atlas.ccce.dev) - Coming soon page for now
server {
    listen 80;
    server_name atlas.ccce.dev;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name atlas.ccce.dev;

    ssl_certificate /etc/letsencrypt/live/atlas.ccce.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/atlas.ccce.dev/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

# Create a coming soon page
cat > /usr/share/nginx/html/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>CCCE Atlas</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        h1 { font-size: 3em; margin: 0; }
        p { font-size: 1.2em; margin: 20px 0; }
        a { color: #ffd700; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>CCCE Atlas</h1>
        <p>Corpus Christi Civic Explorer</p>
        <p><a href="https://api.atlas.ccce.dev/docs">API Documentation</a></p>
    </div>
</body>
</html>
EOF

# Reload nginx with new config
echo "→ Reloading nginx..."
systemctl reload nginx

# Set up auto-renewal
echo "→ Setting up SSL auto-renewal..."
systemctl enable certbot-renew.timer

echo ""
echo "======================================"
echo "✅ Setup Complete!"
echo "======================================"
echo ""
echo "Your sites are now available at:"
echo "  https://atlas.ccce.dev (frontend - coming soon page)"
echo "  https://api.atlas.ccce.dev (API)"
echo ""
echo "API Documentation:"
echo "  https://api.atlas.ccce.dev/docs"
echo ""
echo "SSL certificates will auto-renew."
echo ""
