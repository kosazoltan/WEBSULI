#!/bin/bash
# VPS Deployment Fix Script (VPS-en futtatható)
# Használat: ssh root@95.216.191.162 'bash -s' < fix-vps-deployment.sh
# VAGY: másold a VPS-re és futtasd: bash fix-vps-deployment.sh

set -e

echo "🔧 VPS Deployment Fix"
echo ""

PROJECT_DIR="/var/www/websuli/source"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Projekt könyvtár nem található: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

echo "📥 Git pull..."
git pull origin main

echo "📦 npm install..."
npm install

echo "🧹 Build cleanup..."
rm -rf dist node_modules/.vite

echo "🔨 Build..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ Build sikertelen!"
    exit 1
fi

echo "✅ Build sikeres!"

echo "♻️  PM2 restart..."
pm2 delete websuli 2>/dev/null || true
sleep 2
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
sleep 3
pm2 save

echo "✅ Deployment fix befejezve!"
echo ""
echo "PM2 Státusz:"
pm2 list | grep websuli
