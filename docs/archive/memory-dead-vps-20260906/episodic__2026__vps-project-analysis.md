---
id: episodic_deploy_20260410_405
type: episodic
domain: deploy
created: 2026-04-10
source: VPS-PROJECT-ANALYSIS.md
tags: [vps, 95.216.191.162, repz, analysis, docker]
project: websuli
---

# VPS Projekt Analízis - 95.216.191.162

## Aktív projektok a VPS-en: REPZ
- Path: `/opt/repz/`
- Alprojektek: api, desktop, ebc-source-latest, forras-kod-extract
- Node.js process (PID 3231): `node src/index.js`, ~117MB memória

## Hálózati szolgáltatások
- Port 22 (SSH), 80 (HTTP, docker-proxy), 5432 (PostgreSQL), 53 (DNS)
- Nginx: NINCS, Apache: NINCS, Docker: van (80-as port)

## WebSuli státusz
- `/var/www/websuli`: ❌ NEM LÉTEZIK
- PM2: NINCS telepítve
- WebSuli process: NEM FUT

## Következtetés
**Ez a VPS REPZ projektet futtat, NEM WebSulit.**

WebSuli VPS: valószínűleg 31.97.44.1 (Hostinger)
