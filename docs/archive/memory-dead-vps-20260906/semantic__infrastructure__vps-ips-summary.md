---
id: semantic_infrastructure_20260410_209
type: semantic
domain: infrastructure
created: 2026-04-10
source: VPS-IPS-SUMMARY.md
tags: [vps, ip-addresses, hetzner, hostinger, repz]
project: websuli
---

# VPS IP Összefoglaló

## 95.216.191.162 (Hetzner)
- Projekt: **REPZ** (NEM WebSuli)
- Path: `/opt/repz/`
- Fut: Node.js, PostgreSQL, Docker containers
- SSH: elérhető
- WebSuli: NEM telepítve

## 31.97.44.1 (Hostinger - valószínűleg WebSuli)
- SSH: nem elérhető (timeout)
- Domain: websuli.vip (valószínű)
- SSH Config: `Host websuli` → 31.97.44.1

## WebSuli VPS valódi IP-jének megtalálása
1. GitHub Secrets: VPS_HOST értéke
2. Hostinger hPanel → VPS
3. DNS: websuli.vip → melyik IP-re mutat?
4. GitHub Actions logok: melyik IP-re deploy-ol

**Biztonsági megjegyzés: Konkrét VPS IP-ket NE commitolj a repo-ba!**
