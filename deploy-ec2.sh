#!/bin/bash
###################################################################################################
# KaliNiTidi Game - EC2 Deployment Script
# Based on actual commands tested on EC2
# Usage: chmod +x deploy-ec2.sh && ./deploy-ec2.sh
###################################################################################################

set -euo pipefail

echo "=========================================="
echo "KaliNiTidi EC2 Deployment"
echo "=========================================="

# === Step 1: Update System ===
echo "[1/8] Updating system packages..."
sudo apt-get update -y

# === Step 2: Install Dependencies ===
echo "[2/8] Installing dependencies..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release git

# === Step 3: Setup Docker GPG Key ===
echo "[3/8] Adding Docker GPG key..."
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# === Step 4: Add Docker Repository ===
echo "[4/8] Adding Docker repository..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# === Step 5: Install Docker ===
echo "[5/8] Installing Docker..."
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# === Step 6: Start Docker ===
echo "[6/8] Starting Docker service..."
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ubuntu

# === Step 7: Clone Repository ===
echo "[7/8] Cloning repository..."
cd ~
if [ -d "KaliNiTidi" ]; then
  echo "Removing existing directory..."
  rm -rf KaliNiTidi
fi
git clone https://github.com/BhavinDalsaniya/KaliNiTidi.git
cd KaliNiTidi

# === Step 8: Build and Run ===
echo "[8/8] Building and starting container..."
docker build -t kalanitidi-game .

# Stop and remove old container if exists
docker stop kalanitidi-app 2>/dev/null || true
docker rm kalanitidi-app 2>/dev/null || true

# Run new container
docker run -d \
  --name kalanitidi-app \
  --restart unless-stopped \
  -p 3000:3000 \
  kalanitidi-game

# === Verification ===
echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="

# Get EC2 public IP
INSTANCE_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "YOUR_EC2_IP")

echo "Container Status:"
docker ps

echo ""
echo "Application URL: http://$INSTANCE_IP:3000"
echo ""
echo "View logs: docker logs -f kalanitidi-app"
echo "=========================================="
