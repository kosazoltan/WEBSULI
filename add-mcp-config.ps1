# Script to add MCP configuration to Cursor settings
# Usage: .\add-mcp-config.ps1

$settingsPath = "$env:APPDATA\Cursor\User\settings.json"
$backupPath = "$settingsPath.backup"

Write-Host "Adding MCP Configuration to Cursor Settings" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $settingsPath)) {
    Write-Host "ERROR: Settings file not found: $settingsPath" -ForegroundColor Red
    Write-Host "Please start Cursor first and open Settings!" -ForegroundColor Yellow
    exit 1
}

# Check if MCP config already exists
$content = Get-Content $settingsPath -Raw
if ($content -match 'hostinger-mcp') {
    Write-Host "MCP configuration already exists!" -ForegroundColor Yellow
    $overwrite = Read-Host "Overwrite? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Backup
Write-Host "Creating backup..." -ForegroundColor Cyan
Copy-Item $settingsPath $backupPath -Force
Write-Host "Backup created: $backupPath" -ForegroundColor Green

# Read file as text (to preserve comments)
$lines = Get-Content $settingsPath

# Find the closing brace of the root object (before the last line if it's just a closing brace)
# We'll add mcpServers before the last closing brace
$mcpConfig = @"
  "mcpServers": {
    "hostinger-mcp": {
      "command": "npx",
      "args": [
        "hostinger-api-mcp@latest"
      ],
      "env": {
        "API_TOKEN": "s71buGgJnOVyUnMxn9L26ugezYR3DgNYT8L6z2mycc3eecac"
      }
    }
  }
}
"@

# Simple approach: Add before the last closing brace
$newLines = @()
$foundLastBrace = $false
for ($i = $lines.Length - 1; $i -ge 0; $i--) {
    if (-not $foundLastBrace -and $lines[$i].Trim() -eq '}') {
        # Add MCP config before this closing brace
        $newLines = ,$mcpConfig + $newLines
        $newLines = ,$lines[$i] + $newLines
        $foundLastBrace = $true
    } else {
        $newLines = ,$lines[$i] + $newLines
    }
}

if (-not $foundLastBrace) {
    Write-Host "ERROR: Could not find closing brace in JSON" -ForegroundColor Red
    Write-Host "Please add the MCP config manually" -ForegroundColor Yellow
    exit 1
}

# Reverse the array to get correct order
$newLines = $newLines | ForEach-Object { $_ }

# Write to file
try {
    $newLines | Set-Content $settingsPath -Encoding UTF8
    Write-Host "MCP configuration added successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Restart Cursor" -ForegroundColor White
    Write-Host "2. MCP server will be available" -ForegroundColor White
    Write-Host "3. Use MCP to query VPS information" -ForegroundColor White
} catch {
    Write-Host "ERROR saving file: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Restoring from backup..." -ForegroundColor Yellow
    Copy-Item $backupPath $settingsPath -Force
    exit 1
}
