#!/bin/bash
#
# EC2 Setup Script for CCCE Atlas
# Run this on your EC2 instance after initial SSH connection
#
# Usage: bash setup-ec2.sh

set -e

echo "======================================"
echo "CCCE Atlas - EC2 Setup Script"
echo "======================================"
echo ""

# Update system
echo "→ Updating system packages..."
sudo yum update -y

# Install Docker
echo "→ Installing Docker..."
sudo yum install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
echo "→ Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
echo "→ Installing Git..."
sudo yum install git -y

# Install PostgreSQL client (for testing RDS connection)
echo "→ Installing PostgreSQL client..."
sudo yum install postgresql15 -y

# Install htop for monitoring
echo "→ Installing htop..."
sudo yum install htop -y

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Log out and back in (for Docker group to take effect)"
echo "2. Clone your repository"
echo "3. Create .env.production file"
echo "4. Run: docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "To reconnect: exit, then ssh back in"
