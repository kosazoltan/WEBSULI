#!/bin/bash
# Quick VPS Deployment Script - Use after uploading deploy_package_hero_redesign.zip
# Run this script on VPS after extracting the zip file

set -e

echo "🚀 Quick VPS Deployment - Hero Section Redesign"
echo ""

# Check if we're in the right directory
if [ ! -f "deploy/ecosystem.config.cjs" ]; then
    echo "❌ Error: Please run this script from the websuli/source directory"
    exit 1
fi

# Check if dist folder exists
if [ ! -d "dist" ]; then
    echo "❌ Error: dist folder not found. Make sure you extracted the deploy package."
    exit 1
fi

echo "✅ Deployment package found"
echo ""

# Show what's being deployed
echo "📦 Deployment contents:"
ls -la dist/public/assets/*.css | head -3
echo "..."
echo ""

# Restart PM2
echo "♻️ Restarting application..."
pm2 delete websuli 2>/dev/null || true
sleep 2

pm2 start deploy/ecosystem.config.cjs --name websuli --update-env || {
    echo "❌ Error: PM2 start failed!"
    exit 1
}

sleep 3

# Check status
if pm2 list | grep -q "websuli.*online"; then
    echo ""
    echo "✅ Application is running!"
    pm2 list | grep websuli
else
    echo "❌ Application failed to start!"
    pm2 logs websuli --lines 20 --nostream
    exit 1
fi

pm2 save

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Deployment completed successfully!"
echo ""
echo "🎨 New Features:"
echo "   - Hero Section with vibrant gradients (purple→pink→orange)"
echo "   - Animated particles with glow effects"
echo "   - Floating math formulas and educational icons"
echo "   - Enhanced glassmorphism cards"
echo "   - Gradient badges for PDF/HTML"
echo ""
echo "🌐 Application URL: https://websuli.vip"
echo ""
echo "📋 To clear cache:"
echo "   1. Open Chrome DevTools (F12)"
echo "   2. Right-click refresh button → 'Empty Cache and Hard Reload'"
echo "   3. Or: Ctrl+Shift+Delete → Clear cached images and files"
echo "═══════════════════════════════════════════════════════"
