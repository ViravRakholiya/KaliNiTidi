#!/bin/bash
set -euxo pipefail
exec > /var/log/init-script.log 2>&1

# === KaliNiTidi Game - AWS EC2 Initialization Script ===
# This script sets up a fresh Ubuntu EC2 instance to run the KaliNiTidi card game backend

# === 1️⃣ Update system and install dependencies ===
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git

# === 2️⃣ Add Docker's official GPG key ===
mkdir -p /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi

# === 3️⃣ Add Docker repository ===
if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
fi

# === 4️⃣ Install Docker Engine + Compose plugin ===
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# === 5️⃣ Enable and start Docker ===
systemctl enable docker
systemctl start docker

# === 6️⃣ Allow running docker without sudo ===
usermod -aG docker ubuntu || true

# === 7️⃣ Clone your GitHub repository ===
# TODO: Replace with your actual GitHub repository URL
REPO_URL="https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git"
cd /home/ubuntu
if [ ! -d "KaliNiTidi" ]; then
  git clone "$REPO_URL" KaliNiTidi
fi
cd KaliNiTidi

# === 8️⃣ Create .env file from .env.example ===
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "⚠️  IMPORTANT: Edit /home/ubuntu/KaliNiTidi/.env with your Supabase credentials!"
  echo "   Required variables: SUPABASE_URL, SUPABASE_KEY"
fi

# === 9️⃣ Build Docker image ===
docker build -t kalanitidi-game .

# === 🔟 Stop and remove existing container if running ===
if [ "$(docker ps -q -f name=kalanitidi-app)" ]; then
  docker stop kalanitidi-app
  docker rm kalanitidi-app
fi

# === 1️⃣1️⃣ Run container on port 3000 ===
docker run -d \
  -p 3000:3000 \
  --restart=always \
  --name kalanitidi-app \
  kalanitidi-game

# === 1️⃣2️⃣ Configure Security Group Reminder ===
echo "✅ KaliNiTidi Game deployment complete!"
echo ""
echo "📋 REMINDER: Configure your EC2 Security Group to allow inbound traffic on:"
echo "   - Port 3000 (HTTP) for the game server"
echo "   - Port 22 (SSH) for administration"
echo ""
echo "🔍 Check logs with: docker logs -f kalanitidi-app"
echo "🌐 Access your game at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
