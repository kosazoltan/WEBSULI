# Setup New SSH Key for WebSuli VPS
# This script generates a new SSH key and provides instructions

$SSH_DIR = "$env:USERPROFILE\.ssh"
$KEY_NAME = "id_rsa_websuli"
$PUBLIC_KEY_PATH = "$SSH_DIR\$KEY_NAME.pub"
$PRIVATE_KEY_PATH = "$SSH_DIR\$KEY_NAME"

Write-Host "=== WebSuli VPS SSH Setup ===" -ForegroundColor Cyan
Write-Host ""

# Create .ssh directory if it doesn't exist
if (-not (Test-Path $SSH_DIR)) {
    New-Item -ItemType Directory -Path $SSH_DIR -Force | Out-Null
    Write-Host "Created .ssh directory" -ForegroundColor Green
}

# Check if key already exists
if (Test-Path $PRIVATE_KEY_PATH) {
    Write-Host "SSH key already exists: $KEY_NAME" -ForegroundColor Yellow
    $overwrite = Read-Host "Overwrite? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Using existing key" -ForegroundColor Cyan
        $useExisting = $true
    } else {
        Remove-Item $PRIVATE_KEY_PATH -Force -ErrorAction SilentlyContinue
        Remove-Item $PUBLIC_KEY_PATH -Force -ErrorAction SilentlyContinue
        $useExisting = $false
    }
} else {
    $useExisting = $false
}

# Generate new SSH key if needed
if (-not $useExisting) {
    Write-Host "Generating new SSH key pair..." -ForegroundColor Cyan
    $keyComment = "websuli-vps-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    
    # Generate key without passphrase for automation
    ssh-keygen -t rsa -b 4096 -f $PRIVATE_KEY_PATH -N '""' -C $keyComment
    
    if (Test-Path $PRIVATE_KEY_PATH) {
        Write-Host "SSH key generated successfully!" -ForegroundColor Green
    } else {
        Write-Host "Error generating SSH key!" -ForegroundColor Red
        exit 1
    }
}

# Display public key
Write-Host "`n=== SSH Public Key ===" -ForegroundColor Cyan
Write-Host "Copy this key to add to the VPS:`n" -ForegroundColor Yellow

if (Test-Path $PUBLIC_KEY_PATH) {
    $publicKey = Get-Content $PUBLIC_KEY_PATH
    Write-Host $publicKey -ForegroundColor White
    Write-Host ""
    
    # Copy to clipboard if possible
    try {
        $publicKey | Set-Clipboard
        Write-Host "Public key copied to clipboard!" -ForegroundColor Green
    } catch {
        Write-Host "Could not copy to clipboard (copy manually)" -ForegroundColor Yellow
    }
} else {
    Write-Host "Public key file not found!" -ForegroundColor Red
    exit 1
}

# Update SSH config
Write-Host "`n=== SSH Config Setup ===" -ForegroundColor Cyan

$SSH_CONFIG = "$SSH_DIR\config"
$configEntry = @"

Host websuli
    HostName 31.97.44.1
    User root
    IdentityFile $PRIVATE_KEY_PATH
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
"@

if (Test-Path $SSH_CONFIG) {
    $configContent = Get-Content $SSH_CONFIG -Raw
    if ($configContent -match "Host websuli") {
        Write-Host "SSH config already has 'websuli' entry" -ForegroundColor Yellow
        $update = Read-Host "Update? (y/N)"
        if ($update -eq "y" -or $update -eq "Y") {
            # Remove old websuli entry
            $newConfig = $configContent -replace "(?s)Host websuli.*?(?=\nHost|\Z)", ""
            $newConfig = $newConfig.Trim()
            if ($newConfig -and -not $newConfig.EndsWith("`n")) {
                $newConfig += "`n"
            }
            $newConfig += $configEntry
            Set-Content -Path $SSH_CONFIG -Value $newConfig -NoNewline
            Write-Host "SSH config updated!" -ForegroundColor Green
        }
    } else {
        # Append new entry
        Add-Content -Path $SSH_CONFIG -Value $configEntry
        Write-Host "Added 'websuli' entry to SSH config" -ForegroundColor Green
    }
} else {
    # Create new config file
    Set-Content -Path $SSH_CONFIG -Value $configEntry -NoNewline
    Write-Host "Created SSH config file" -ForegroundColor Green
}

# Set correct permissions (on Windows this is less critical, but good practice)
icacls $PRIVATE_KEY_PATH /inheritance:r /grant:r "$env:USERNAME`:F" | Out-Null

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Add the public key to the VPS:" -ForegroundColor White
Write-Host "   Option A: Via Hostinger hPanel (if available)" -ForegroundColor Gray
Write-Host "     - Login to hPanel: https://hpanel.hostinger.com" -ForegroundColor Gray
Write-Host "     - Go to VPS → Settings → SSH Keys" -ForegroundColor Gray
Write-Host "     - Add the public key above" -ForegroundColor Gray
Write-Host ""
Write-Host "   Option B: If you have password access:" -ForegroundColor Gray
Write-Host "     ssh-copy-id -i $PUBLIC_KEY_PATH root@31.97.44.1" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Test the connection:" -ForegroundColor White
Write-Host "   ssh websuli" -ForegroundColor Gray
Write-Host ""
Write-Host "3. If connection works, update GitHub Secrets:" -ForegroundColor White
Write-Host "   - GitHub → Settings → Secrets → VPS_SSH_KEY" -ForegroundColor Gray
Write-Host "   - Copy the PRIVATE key content:" -ForegroundColor Gray
Write-Host "     Get-Content $PRIVATE_KEY_PATH" -ForegroundColor Gray

Write-Host "`n=== Private Key (for GitHub Secrets) ===" -ForegroundColor Yellow
Write-Host "DO NOT share this key! Only use for GitHub Secrets:`n" -ForegroundColor Red
Write-Host "Run this command to view the private key:" -ForegroundColor White
Write-Host "Get-Content `"$PRIVATE_KEY_PATH`"" -ForegroundColor Cyan
Write-Host ""
