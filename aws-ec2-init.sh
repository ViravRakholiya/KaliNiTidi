#!/bin/bash
###################################################################################################
# KaliNiTidi Game - AWS EC2 User Data Initialization Script
# This script automatically configures a fresh Ubuntu EC2 instance to run the KaliNiTidi backend
#
# PREREQUISITES:
# 1. Update REPO_URL below with your actual GitHub repository
# 2. Ensure your .env variables are set (either in GitHub Secrets or manually after deployment)
# 3. Configure EC2 Security Group to allow inbound: Port 3000 (TCP) and Port 22 (SSH)
#
# USAGE:
# - Paste this script into EC2 Launch Wizard > Advanced Details > User data
# - Or add to Auto Scaling Group Launch Configuration > User data
###################################################################################################

set -euo pipefail

# Redirect all output to log file (both stdout and stderr)
exec > >(tee /var/log/user-data.log) 2>&1

echo "=========================================="
echo "KaliNiTidi EC2 Deployment Started"
echo "Timestamp: $(date)"
echo "=========================================="

# === CONFIGURATION ===
# TODO: UPDATE THIS WITH YOUR ACTUAL REPOSITORY URL
REPO_URL="https://github.com/BhavinDalsaniya/KaliNiTidi.git"
REPO_DIR="KaliNiTidi"
APP_PORT=3000
CONTAINER_NAME="kalanitidi-app"
DOCKER_IMAGE_NAME="kalanitidi-game"

# === 1. SYSTEM UPDATE & DEPENDENCIES ===
echo "[1/9] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

# Install essential packages with retry
for i in {1..3}; do
  apt-get install -y ca-certificates curl gnupg lsb-release git git-core && break || sleep 5
done

# === 2. INSTALL DOCKER (Official Method) ===
echo "[2/9] Installing Docker..."

# Remove any existing Docker installations
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Create Docker keyrings directory
mkdir -p /etc/apt/keyrings
chmod 755 /etc/apt/keyrings

# Add Docker's official GPG key
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

# Add Docker repository
if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
fi

# Install Docker Engine
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# === 3. START & ENABLE DOCKER ===
echo "[3/9] Starting Docker service..."
systemctl enable docker
systemctl start docker

# Verify Docker is running
if ! docker info &>/dev/null; then
  echo "ERROR: Docker failed to start!"
  exit 1
fi

# === 4. ADD UBUNTU USER TO DOCKER GROUP ===
echo "[4/9] Configuring Docker permissions..."
usermod -aG docker ubuntu || true

# === 5. CLONE REPOSITORY ===
echo "[5/9] Cloning repository..."
cd /home/ubuntu

# Remove existing directory if present (for clean redeploy)
if [ -d "$REPO_DIR" ]; then
  echo "Removing existing repository directory..."
  rm -rf "$REPO_DIR"
fi

# Clone with retry logic
for i in {1..3}; do
  if git clone --depth 1 "$REPO_URL" "$REPO_DIR"; then
    echo "Repository cloned successfully!"
    break
  else
    echo "Git clone attempt $i failed, retrying..."
    sleep 3
  fi
done

cd "$REPO_DIR" || exit 1

# Fix permissions
chown -R ubuntu:ubuntu /home/ubuntu/"$REPO_DIR"

# === 6. SETUP ENVIRONMENT FILE ===
echo "[6/9] Setting up environment file..."
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "⚠️  .env file created from .env.example"
  echo "⚠️  YOU MUST EDIT /home/ubuntu/$REPO_DIR/.env with your credentials!"
fi

# === 7. STOP & REMOVE EXISTING CONTAINERS ===
echo "[7/9] Cleaning up old containers..."
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker stop "$CONTAINER_NAME" || true
  docker rm "$CONTAINER_NAME" || true
fi

# === 8. BUILD DOCKER IMAGE ===
echo "[8/9] Building Docker image..."
if docker build -t "$DOCKER_IMAGE_NAME" .; then
  echo "Docker image built successfully!"
else
  echo "ERROR: Docker build failed!"
  exit 1
fi

# === 9. RUN CONTAINER ===
echo "[9/9] Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "$APP_PORT:$APP_PORT" \
  --env-file .env \
  --health-cmd="node -e \"require('http').get('http://localhost:$APP_PORT/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\"" \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=3 \
  --health-start-period=10s \
  "$DOCKER_IMAGE_NAME"

# === VERIFY DEPLOYMENT ===
echo ""
echo "=========================================="
echo "DEPLOYMENT VERIFICATION"
echo "=========================================="

# Wait for container to start
sleep 5

# Check container status
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "✅ Container is running: $CONTAINER_NAME"
else
  echo "❌ Container failed to start!"
  docker logs "$CONTAINER_NAME"
  exit 1
fi

# Get instance IP
INSTANCE_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "YOUR_EC2_PUBLIC_IP")

# === DEPLOYMENT SUMMARY ===
echo ""
echo "=========================================="
echo "✅ DEPLOYMENT SUCCESSFUL!"
echo "=========================================="
echo ""
echo "📦 Container: $CONTAINER_NAME"
echo "🌐 Application URL: http://$INSTANCE_IP:$APP_PORT"
echo ""
echo "📋 USEFUL COMMANDS:"
echo "   View logs:     docker logs -f $CONTAINER_NAME"
echo "   Restart:       docker restart $CONTAINER_NAME"
echo "   Stop:          docker stop $CONTAINER_NAME"
echo "   Shell access:  docker exec -it $CONTAINER_NAME sh"
echo "   Status:        docker ps"
echo ""
echo "🔧 CONFIGURATION NEEDED:"
echo "   1. Edit /home/ubuntu/$REPO_DIR/.env with your Supabase credentials"
echo "   2. Restart container: docker restart $CONTAINER_NAME"
echo "   3. Ensure Security Group allows Port $APP_PORT inbound"
echo ""
echo "=========================================="
