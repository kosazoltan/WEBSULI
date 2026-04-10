# VAULT: Hostinger VPS Kanonikus Tudás

## WebSuli VPS (Hostinger)
- **Valószínű IP**: 31.97.44.1
- **Domain**: websuli.vip (Cloudflare CDN)
- **SSH**: `ssh websuli` (config: ~/.ssh/config)
- **Path**: `/var/www/websuli/source`
- **PM2 process**: websuli
- **Nginx**: reverse proxy → localhost:5000
- **SSL**: Let's Encrypt

## Nem WebSuli VPS-ek
- **95.216.191.162** (Hetzner): REPZ projekt fut rajta, WebSuli NEM telepített
- **72.62.91.221**: ismeretlen, nem tesztelt

## GitHub Secrets
- VPS_HOST, VPS_USERNAME (root), VPS_SSH_KEY
- SSH kulcs: `C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli`

## MCP szerver (Cursor IDE)
- hostinger-api-mcp package
- settings.json: `%APPDATA%\Cursor\User\settings.json`
- API token: NE commitold!

## Kulcs tanulság
A VPS-CONFIG.md és VPS-DEPLOY-FIX.md a 95.216.191.162 IP-t dokumentálják, de ez REPZ VPS! A WebSuli VPS 31.97.44.1.
