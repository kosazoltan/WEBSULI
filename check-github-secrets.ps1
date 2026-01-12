# GitHub Secrets SSH Kulcs Ellenőrző Script

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub Secrets SSH Kulcs Ellenőrző" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# SSH kulcs elérési út
$sshKeyPath = "$env:USERPROFILE\.ssh\id_rsa_websuli"
$sshPublicKeyPath = "$env:USERPROFILE\.ssh\id_rsa_websuli.pub"

Write-Host "1. SSH kulcs fájlok ellenőrzése..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path $sshKeyPath) {
    Write-Host "✅ Privát kulcs létezik: $sshKeyPath" -ForegroundColor Green
    
    $privateKey = Get-Content $sshKeyPath -Raw
    $firstLine = ($privateKey -split "`n")[0]
    $lastLine = ($privateKey -split "`n")[-1]
    
    Write-Host "   Első sor: $firstLine" -ForegroundColor Gray
    Write-Host "   Utolsó sor: $lastLine" -ForegroundColor Gray
    Write-Host "   Kulcs hossza: $($privateKey.Length) karakter" -ForegroundColor Gray
    Write-Host ""
    
    # Formátum ellenőrzés
    if ($privateKey -match "BEGIN.*PRIVATE KEY") {
        Write-Host "✅ Kulcs formátuma helyes (BEGIN/END sorokkal)" -ForegroundColor Green
    } else {
        Write-Host "❌ HIBA: A kulcs nem tartalmazza a BEGIN/END sorokat!" -ForegroundColor Red
    }
    
    # Új sor karakterek ellenőrzése
    if ($privateKey -match "`r`n") {
        Write-Host "⚠️  FIGYELEM: Windows line endings (CRLF) található - GitHub-nak LF kell!" -ForegroundColor Yellow
    }
    
} else {
    Write-Host "❌ HIBA: Privát kulcs NEM található: $sshKeyPath" -ForegroundColor Red
    Write-Host ""
}

if (Test-Path $sshPublicKeyPath) {
    Write-Host "✅ Nyilvános kulcs létezik: $sshPublicKeyPath" -ForegroundColor Green
    $publicKey = Get-Content $sshPublicKeyPath -Raw
    Write-Host "   Nyilvános kulcs: $($publicKey.Trim())" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "⚠️  Nyilvános kulcs NEM található: $sshPublicKeyPath" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "2. SSH kapcsolat tesztelése a VPS-re..." -ForegroundColor Yellow
Write-Host ""

$vpsIp = "31.97.44.1"
Write-Host "   VPS IP: $vpsIp" -ForegroundColor Gray
Write-Host "   Felhasználó: root" -ForegroundColor Gray
Write-Host ""

try {
    $testResult = ssh -F NUL -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i $sshKeyPath root@$vpsIp "echo 'SSH connection test successful' && hostname" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ SSH kapcsolat MŰKÖDIK!" -ForegroundColor Green
        Write-Host "   Válasz: $testResult" -ForegroundColor Gray
    } else {
        Write-Host "❌ SSH kapcsolat SIKERTELEN!" -ForegroundColor Red
        Write-Host "   Hiba: $testResult" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ SSH kapcsolat HIBA: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "3. GitHub Secrets ellenőrzés (MANUÁLISAN):" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Menj ide: https://github.com/kosazoltan/WEBSULI/settings/secrets/actions" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Ellenőrizd, hogy a következő secret-ek léteznek:" -ForegroundColor White
Write-Host "   - VPS_HOST = 31.97.44.1" -ForegroundColor White
Write-Host "   - VPS_USERNAME = root" -ForegroundColor White
Write-Host "   - VPS_SSH_KEY = [privát kulcs teljes tartalma]" -ForegroundColor White
Write-Host ""

Write-Host "4. VPS_SSH_KEY Secret tartalma ellenőrzése:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   A GitHub Secret-ban a teljes privát kulcs tartalmát kell beilleszteni:" -ForegroundColor White
Write-Host "   - Kezdődik: -----BEGIN..." -ForegroundColor Gray
Write-Host "   - Végződik: ...-----END..." -ForegroundColor Gray
Write-Host "   - Teljes hossz: kb. 1500-2500 karakter (formátumtól függően)" -ForegroundColor Gray
Write-Host ""

Write-Host "5. Privát kulcs tartalma (másold be a GitHub Secret-ba):" -ForegroundColor Yellow
Write-Host ""

if (Test-Path $sshKeyPath) {
    Write-Host "========================================" -ForegroundColor Cyan
    $privateKey = Get-Content $sshKeyPath -Raw
    # Konvertálás LF-re (Unix line endings)
    $privateKeyUnix = $privateKey -replace "`r`n", "`n" -replace "`r", "`n"
    Write-Host $privateKeyUnix
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  FIGYELEM: Másold ki a FENTI TELJES TARTALMAT (BEGIN-től END-ig)!" -ForegroundColor Yellow
    Write-Host "   Ne adj hozzá vagy távolíts el semmit!" -ForegroundColor Yellow
} else {
    Write-Host "❌ Nem lehet megjeleníteni - kulcs fájl nem található" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Ellenőrzés befejezve!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
