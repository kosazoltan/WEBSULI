---
id: semantic_infrastructure_20260410_210
type: semantic
domain: infrastructure
created: 2026-04-10
source: WEBSULI-VPS-INFO.md
tags: [websuli, vps, infrastructure, nginx, pm2, postgresql]
project: websuli
---

# WebSuli VPS Információk

## Valószínű WebSuli VPS: 31.97.44.1 (Hostinger)
- Domain: websuli.vip (Cloudflare CDN)
- SSL: Let's Encrypt

## Szerver Konfiguráció
- OS: Ubuntu 22.04 LTS
- Node.js: 20.x, PostgreSQL (lokális), Nginx, PM2
- App path: `/var/www/websuli/source`
- Build: `/var/www/websuli/source/dist`
- Portok: 5000 (backend), 80, 443, 22

## Adatbázis
- Típus: PostgreSQL
- `DATABASE_URL`: `postgresql://websuli:JELSZO@localhost:5432/websuli`
- Migráció: `npm run db:push`

## GitHub Actions
- Secrets: VPS_HOST, VPS_USERNAME, VPS_SSH_KEY, VPS_PORT
- Branch: main

## Nem WebSuli VPS: 95.216.191.162 (Hetzner, REPZ projekt)
