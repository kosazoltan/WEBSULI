# VPS Diagnosztika es Deployment Fix Script
# Hasznalat: .\diagnose-vps.ps1

param(
    [string]$VpsIp = "95.216.191.162",
    [string]$VpsUser = "root",
    [switch]$Fix = $false
)

Write-Host "VPS Diagnosztika es Deployment Fix" -ForegroundColor Cyan
Write-Host "VPS IP: $VpsIp" -ForegroundColor Yellow
Write-Host ""

# SSH kapcsolat tesztelese
Write-Host "SSH kapcsolat tesztelese..." -ForegroundColor Cyan
$testResult = ssh -o ConnectTimeout=5 -o BatchMode=yes "$VpsUser@$VpsIp" "echo OK" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH kapcsolat sikertelen!" -ForegroundColor Red
    Write-Host "Ellenorizd:" -ForegroundColor Yellow
    Write-Host "  1. Az SSH kulcs be van-e allitva" -ForegroundColor Yellow
    Write-Host "  2. Az IP cim helyes: $VpsIp" -ForegroundColor Yellow
    Write-Host "  3. Probald meg manualisan: ssh $VpsUser@$VpsIp" -ForegroundColor Yellow
    exit 1
}
Write-Host "SSH kapcsolat sikeres!" -ForegroundColor Green
Write-Host ""

# Hasznaljuk a bash scriptet
$scriptPath = Join-Path $PSScriptRoot "diagnose-vps.sh"

if (Test-Path $scriptPath) {
    Write-Host "Diagnosztika futtatasa a VPS-en..." -ForegroundColor Cyan
    Write-Host ""
    Get-Content $scriptPath | ssh "$VpsUser@$VpsIp" "bash -s"
} else {
    Write-Host "Hiba: diagnose-vps.sh nem talalhato!" -ForegroundColor Red
    Write-Host "Alternativa: futtasd kozvetlenul SSH-n keresztul:" -ForegroundColor Yellow
    Write-Host "  ssh $VpsUser@$VpsIp 'bash -s' < diagnose-vps.sh" -ForegroundColor White
    exit 1
}

if ($Fix) {
    Write-Host ""
    Write-Host "Deployment fix futtatasa..." -ForegroundColor Cyan
    Write-Host "Figyelem: Ez ujrainditja az alkalmazast!" -ForegroundColor Yellow
    Write-Host ""
    
    $confirmation = Read-Host "Folytatod? (y/N)"
    if ($confirmation -ne "y" -and $confirmation -ne "Y") {
        Write-Host "Megse." -ForegroundColor Yellow
        exit 0
    }
    
    $fixScriptPath = Join-Path $PSScriptRoot "fix-vps-deployment.sh"
    if (Test-Path $fixScriptPath) {
        Get-Content $fixScriptPath | ssh "$VpsUser@$VpsIp" "bash -s"
    } else {
        Write-Host "Hiba: fix-vps-deployment.sh nem talalhato!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Diagnosztika befejezve!" -ForegroundColor Green
Write-Host ""
Write-Host "Hasznalat:" -ForegroundColor Cyan
Write-Host "  Diagnosztika: .\diagnose-vps.ps1" -ForegroundColor White
Write-Host "  Diagnosztika + Fix: .\diagnose-vps.ps1 -Fix" -ForegroundColor White
