#!/bin/bash
# Direct VPS Deployment Script
# Run this script directly on the VPS via SSH

set -e  # Exit on error

echo "🚀 Starting direct VPS deployment..."

# Navigate to project directory
cd /var/www/websuli/source || {
    echo "❌ Error: /var/www/websuli/source directory not found!"
    echo "Please make sure the project is cloned to /var/www/websuli"
    exit 1
}

# Pull latest changes
echo "📥 Pulling latest code from GitHub..."
git pull origin main || {
    echo "❌ Error: Git pull failed!"
    exit 1
}

# Show latest commit
echo "📋 Latest commit:"
git log -1 --oneline

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install || {
    echo "❌ Error: npm install failed!"
    exit 1
}

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist || true
rm -rf node_modules/.vite || true

# Build the application
echo "🔨 Building application..."
npm run build || {
    echo "❌ Error: Build failed!"
    exit 1
}

# Verify build output exists
if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not found!"
    exit 1
fi

echo "✅ Build completed successfully!"
echo "📁 Build output:"
ls -lah dist/public/assets/ | head -10

# Run database migrations if needed
echo "🗄️ Running database migrations..."
npm run db:push || echo "⚠️ Database migration warning (non-fatal)"

# Force restart application with PM2
echo "♻️ Force restarting application..."
pm2 delete websuli 2>/dev/null || true
sleep 2

# Start application
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env || {
    echo "❌ Error: PM2 start failed!"
    exit 1
}

# Wait for app to start
sleep 3

# Check if app is running
if pm2 list | grep -q "websuli.*online"; then
    echo "✅ Application is running!"
    pm2 list | grep websuli
else
    echo "❌ Application failed to start!"
    echo "📋 Recent logs:"
    pm2 logs websuli --lines 50 --nostream
    exit 1
fi

# Save PM2 process list
pm2 save

echo ""
echo "✅ Deployment completed successfully!"
echo "🌐 Application should be available at: https://websuli.vip"
echo ""
echo "📋 Next steps:"
echo "  1. Clear browser cache (Ctrl+Shift+Delete)"
echo "  2. Unregister Service Worker (DevTools → Application → Service Workers)"
echo "  3. Hard refresh (Ctrl+Shift+R)"
echo "  4. Check PM2 logs: pm2 logs websuli"
echo ""
