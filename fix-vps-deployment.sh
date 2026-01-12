#!/bin/bash
# Quick deployment fix script for WebSuli VPS
# Run: ssh root@31.97.44.1 'bash -s' < fix-vps-deployment.sh

set -e

echo "🚀 Starting WebSuli VPS Deployment Fix"
echo ""

cd /var/www/websuli/source || { echo "❌ Directory not found!"; exit 1; }

echo "📥 Pulling latest code from GitHub..."
git fetch origin
git pull origin main

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🧹 Cleaning old build..."
rm -rf dist node_modules/.vite

echo ""
echo "🔨 Building application..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not found!"
    exit 1
fi

echo ""
echo "✅ Build completed successfully!"

echo ""
echo "♻️ Restarting PM2..."
pm2 delete websuli 2>/dev/null || true
sleep 2
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
sleep 3
pm2 save

echo ""
echo "✅ Deployment completed!"
echo ""
echo "📊 Status:"
pm2 list | grep websuli

echo ""
echo "📝 Last commit:"
git log -1 --oneline
