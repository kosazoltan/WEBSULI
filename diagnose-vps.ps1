# VPS Diagnosztika és Deployment Fix Script
# Használat: .\diagnose-vps.ps1

param(
    [string]$VpsIp = "95.216.191.162",
    [string]$VpsUser = "root",
    [string]$SshKeyPath = "$env:USERPROFILE\.ssh\id_rsa",
    [switch]$Fix = $false
)

Write-Host "🔍 VPS Diagnosztika és Deployment Fix" -ForegroundColor Cyan
Write-Host "VPS IP: $VpsIp" -ForegroundColor Yellow
Write-Host ""

# SSH kapcsolat tesztelése
Write-Host "📡 SSH kapcsolat tesztelése..." -ForegroundColor Cyan
$sshTest = ssh -o ConnectTimeout=5 -o BatchMode=yes "$VpsUser@$VpsIp" "echo 'OK'" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ SSH kapcsolat sikertelen!" -ForegroundColor Red
    Write-Host "Ellenőrizd:" -ForegroundColor Yellow
    Write-Host "  1. Az SSH kulcs be van-e állítva: $SshKeyPath" -ForegroundColor Yellow
    Write-Host "  2. Az IP cím helyes: $VpsIp" -ForegroundColor Yellow
    Write-Host "  3. Próbáld meg manuálisan: ssh $VpsUser@$VpsIp" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ SSH kapcsolat sikeres!" -ForegroundColor Green
Write-Host ""

# Diagnosztikai parancsok
$diagnosticCommands = @"
echo "=== GIT STÁTUSZ ==="
cd /var/www/websuli/source 2>/dev/null || { echo "❌ Projekt könyvtár nem található: /var/www/websuli/source"; exit 1; }
pwd
echo ""
echo "=== GIT BRANCH ÉS COMMIT ==="
git branch --show-current
git log --oneline -5
echo ""
echo "=== GIT PULL SZÜKSÉGES? ==="
git fetch origin
BEHIND=\$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
if [ "\$BEHIND" -gt "0" ]; then
    echo "⚠️  $BEHIND commit lemaradás van!"
else
    echo "✅ Git up-to-date"
fi
echo ""
echo "=== BUILD STÁTUSZ ==="
if [ -d "dist" ]; then
    echo "✅ dist mappa létezik"
    ls -lah dist/public/ 2>/dev/null | head -5
    BUILD_TIME=\$(stat -c %y dist/public/index.html 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1 || echo "N/A")
    echo "Build idő: \$BUILD_TIME"
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
"@

Write-Host "🔍 Diagnosztika futtatása a VPS-en..." -ForegroundColor Cyan
Write-Host ""

ssh "$VpsUser@$VpsIp" $diagnosticCommands

if ($Fix) {
    Write-Host ""
    Write-Host "🔧 Deployment fix futtatása..." -ForegroundColor Cyan
    Write-Host "⚠️  Figyelem: Ez újraindítja az alkalmazást!" -ForegroundColor Yellow
    Write-Host ""
    
    $confirmation = Read-Host "Folytatod? (y/N)"
    if ($confirmation -ne "y" -and $confirmation -ne "Y") {
        Write-Host "Mégse." -ForegroundColor Yellow
        exit 0
    }
    
    $fixCommands = @"
cd /var/www/websuli/source || { echo "❌ Projekt könyvtár nem található!"; exit 1; }
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
echo "♻️  PM2 restart..."
pm2 delete websuli 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
sleep 3
pm2 save
echo "✅ Kész!"
pm2 list | grep websuli
"@
    
    ssh "$VpsUser@$VpsIp" $fixCommands
}

Write-Host ""
Write-Host "✅ Diagnosztika befejezve!" -ForegroundColor Green
Write-Host ""
Write-Host "Használat:" -ForegroundColor Cyan
Write-Host "  Diagnosztika: .\diagnose-vps.ps1" -ForegroundColor White
Write-Host "  Diagnosztika + Fix: .\diagnose-vps.ps1 -Fix" -ForegroundColor White
