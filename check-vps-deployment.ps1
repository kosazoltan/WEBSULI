# Script to check VPS deployment status
# Checks git status, build status, PM2 processes, and recent changes

$VPS_IP = "31.97.44.1"  # Hostinger - WebSuli VPS
$SSH_USER = "root"

Write-Host "`n=== WebSuli VPS Deployment Status Check ===" -ForegroundColor Cyan
Write-Host "VPS: $VPS_IP`n" -ForegroundColor Yellow

# SSH command to check deployment status
$checkScript = @"
echo "=== GIT STATUS ==="
cd /var/www/websuli/source 2>/dev/null || { echo "ERROR: /var/www/websuli/source not found!"; exit 1; }
echo "Current directory: \$(pwd)"
echo "Git remote:"
git remote -v 2>/dev/null || echo "Git not initialized"
echo ""
echo "Current branch:"
git branch --show-current 2>/dev/null || echo "Not on a branch"
echo ""
echo "Last commit:"
git log -1 --oneline --date=short --format="%h %ad %s" 2>/dev/null || echo "No commits found"
echo ""
echo "Git status:"
git status --short 2>/dev/null || echo "Git status failed"
echo ""
echo "=== BUILD STATUS ==="
if [ -d "dist" ]; then
    echo "dist/ directory EXISTS"
    echo "dist/ size: \$(du -sh dist 2>/dev/null | cut -f1)"
    echo "dist/public/assets files:"
    ls -lh dist/public/assets/ 2>/dev/null | head -5 || echo "No assets found"
    echo ""
    echo "Last build time (dist/ modification):"
    stat -c "%y" dist 2>/dev/null || stat -f "%Sm" dist 2>/dev/null || echo "Cannot determine"
else
    echo "dist/ directory NOT FOUND - BUILD NEEDED!"
fi
echo ""
echo "=== PM2 STATUS ==="
pm2 list 2>/dev/null || echo "PM2 not running or not found"
echo ""
echo "=== PM2 PROCESS INFO (websuli) ==="
pm2 describe websuli 2>/dev/null || echo "websuli process not found"
echo ""
echo "=== NODE PROCESSES ==="
ps aux | grep node | grep -v grep | head -5 || echo "No node processes found"
echo ""
echo "=== RECENT PM2 LOGS (last 20 lines) ==="
pm2 logs websuli --lines 20 --nostream 2>/dev/null || echo "Cannot get PM2 logs"
echo ""
echo "=== SERVICE STATUS ==="
systemctl status nginx --no-pager -l 2>/dev/null | head -10 || echo "Cannot check nginx status"
echo ""
echo "=== DISK SPACE ==="
df -h / | tail -1
echo ""
echo "=== CHECKOUT COMPLETE ==="
"@

Write-Host "Connecting to VPS and checking deployment status..." -ForegroundColor Cyan
Write-Host "(This may take a moment...)`n" -ForegroundColor Gray

# Try SSH connection
try {
    $output = ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$SSH_USER@$VPS_IP" $checkScript 2>&1
    Write-Host $output
} catch {
    Write-Host "`n❌ SSH Connection Failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nPossible reasons:" -ForegroundColor Yellow
    Write-Host "  1. VPS is not accessible (firewall, network)" -ForegroundColor White
    Write-Host "  2. SSH key not configured" -ForegroundColor White
    Write-Host "  3. Wrong IP address" -ForegroundColor White
    Write-Host "`nTrying with SSH config alias 'websuli'..." -ForegroundColor Cyan
    try {
        $output = ssh -o ConnectTimeout=10 websuli $checkScript 2>&1
        Write-Host $output
    } catch {
        Write-Host "❌ SSH connection failed with alias 'websuli' too!" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Check GitHub Actions deployment logs" -ForegroundColor White
Write-Host "2. Verify VPS IP address in GitHub secrets" -ForegroundColor White
Write-Host "3. Check if deployment script ran successfully" -ForegroundColor White
Write-Host "4. Verify PM2 process is running latest code" -ForegroundColor White
