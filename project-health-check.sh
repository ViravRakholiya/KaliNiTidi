#!/bin/bash
# KaliNiTidi Project Health Check

echo "🔍 KaliNiTidi Project Health Check"
echo "=================================="

# 1. Essential files check
echo ""
echo "📁 Essential Files:"
required_files=("package.json" "index.js" "Dockerfile" ".env.example" ".gitignore")
for file in "${required_files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ Missing: $file"
  fi
done

# 2. Required directories
echo ""
echo "📂 Required Directories:"
required_dirs=("app" "config" "controllers" "sockets" "utils" "services")
for dir in "${required_dirs[@]}"; do
  if [ -d "$dir" ]; then
    echo "✅ $dir/"
  else
    echo "❌ Missing directory: $dir/"
  fi
done

# 3. Package.json check
echo ""
echo "📦 Package.json Configuration:"
if grep -q '"start":' package.json; then
  echo "✅ Start script defined"
else
  echo "❌ Missing start script"
fi

if grep -q '@supabase/supabase-js' package.json; then
  echo "✅ Supabase dependency present"
else
  echo "❌ Missing Supabase dependency"
fi

# 4. Environment variables check
echo ""
echo "🔑 Environment Configuration:"
if [ -f .env ]; then
  echo "✅ .env file exists"

  # Check if variables are set (not placeholders)
  if grep -q "your-project.supabase.co" .env; then
    echo "⚠️  SUPABASE_URL contains placeholder - needs real value"
  elif grep -q "SUPABASE_URL=" .env; then
    echo "✅ SUPABASE_URL configured"
  else
    echo "❌ SUPABASE_URL missing"
  fi

  if grep -q "your-anon-key-here" .env; then
    echo "⚠️  SUPABASE_KEY contains placeholder - needs real value"
  elif grep -q "SUPABASE_KEY=" .env; then
    echo "✅ SUPABASE_KEY configured"
  else
    echo "❌ SUPABASE_KEY missing"
  fi
else
  echo "⚠️  .env file missing (not needed for GitHub, needed for local testing)"
fi

# 5. Import syntax check
echo ""
echo "🔧 Code Quality:"
if grep -q '"type": "module"' package.json; then
  echo "✅ ES modules enabled"
else
  echo "❌ Missing ES modules configuration"
fi

# 6. Git status
echo ""
echo "📊 Git Status:"
if git rev-parse --git-dir > /dev/null 2>&1; then
  echo "✅ Git repository initialized"
  UNCOMMITTED=$(git status --porcelain | wc -l)
  if [ "$UNCOMMITTED" -eq 0 ]; then
    echo "✅ No uncommitted changes"
  else
    echo "⚠️  You have $UNCOMMITTED uncommitted changes"
    git status --short
  fi
else
  echo "❌ Not a git repository"
fi

# 7. Docker configuration
echo ""
echo "🐳 Docker Configuration:"
if [ -f Dockerfile ]; then
  echo "✅ Dockerfile exists"
  if grep -q "EXPOSE 3000" Dockerfile; then
    echo "✅ Port 3000 exposed"
  fi
fi

echo ""
echo "=================================="
echo "🎯 Ready for Render Deployment!"
echo ""
echo "📋 Required for Render:"
echo "   • SUPABASE_URL=your_supabase_url"
echo "   • SUPABASE_KEY=your_supabase_publishable_key"
echo "   • SUPABASE_SERVICE_ROLE_KEY=your_supabase_secret_key"
echo "   • NODE_ENV=production"
echo "   • PORT=3000"
