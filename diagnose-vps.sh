#!/bin/bash
# VPS Diagnosztika és Deployment Fix Script (Bash verzió - VPS-en futtatható)
# Használat: ssh root@95.216.191.162 'bash -s' < diagnose-vps.sh
# VAGY: másold a VPS-re és futtasd: bash diagnose-vps.sh

set -e

VPS_IP="${VPS_IP:-95.216.191.162}"
VPS_USER="${VPS_USER:-root}"

echo "🔍 VPS Diagnosztika és Deployment Fix"
echo "VPS IP: $VPS_IP"
echo ""

# Projekt könyvtár
PROJECT_DIR="/var/www/websuli/source"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Projekt könyvtár nem található: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

echo "=== GIT STÁTUSZ ==="
pwd
echo ""
echo "=== GIT BRANCH ÉS COMMIT ==="
git branch --show-current
git log --oneline -5
echo ""
echo "=== GIT PULL SZÜKSÉGES? ==="
git fetch origin
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
if [ "$BEHIND" -gt "0" ]; then
    echo "⚠️  $BEHIND commit lemaradás van!"
else
    echo "✅ Git up-to-date"
fi
echo ""
echo "=== BUILD STÁTUSZ ==="
if [ -d "dist" ]; then
    echo "✅ dist mappa létezik"
    ls -lah dist/public/ 2>/dev/null | head -5
    BUILD_TIME=$(stat -c %y dist/public/index.html 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1 || echo "N/A")
    echo "Build idő: $BUILD_TIME"
else
    echo "❌ dist mappa nem létezik!"
fi
echo ""
echo "=== PM2 STÁTUSZ ==="
pm2 list | grep websuli || echo "⚠️  websuli process nem található"
echo ""
echo "=== PM2 LOGOK (utolsó 10 sor) ==="
pm2 logs websuli --lines 10 --nostream 2>/dev/null || echo "⚠️  Nem lehet lekérni a logokat"
echo ""
echo "=== NODE VERSION ==="
node --version
echo ""
echo "=== DISK SPACE ==="
df -h / | tail -1
echo ""
echo "✅ Diagnosztika befejezve!"
