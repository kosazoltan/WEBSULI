---
id: semantic_infrastructure_20260410_208
type: semantic
domain: infrastructure
created: 2026-04-10
source: VPS-CONFIG.md
tags: [vps, nginx, pm2, config, infrastructure]
project: websuli
---

# VPS Konfiguráció

## Szerver Adatok
- **IP**: 95.216.191.162 (lásd megjegyzés)
- **Domain**: websuli.vip (Cloudflare CDN)
- **OS**: Ubuntu 22.04 LTS
- **Node.js**: 20.x

## Alkalmazás
- **Path**: `/var/www/websuli/source`
- **PM2 process**: `websuli`
- **Port**: 5000 (backend), 80/443 (Nginx)

## Nginx
- Config: `/etc/nginx/sites-available/websuli.vip`
- Proxy: `http://localhost:5000`
- SSL: Let's Encrypt

## PM2 parancsok
```bash
pm2 list
pm2 logs websuli
pm2 restart websuli
```

## GitHub Actions Secrets
- VPS_HOST, VPS_USERNAME, VPS_SSH_KEY, VPS_PORT (22)

**Megjegyzés**: VPS-CONFIG.md 95.216.191.162-t dokumentál, de ez REPZ VPS! WebSuli VPS: 31.97.44.1 (SSH config)
