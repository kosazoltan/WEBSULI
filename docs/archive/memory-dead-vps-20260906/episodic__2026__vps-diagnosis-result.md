---
id: episodic_deploy_20260410_404
type: episodic
domain: deploy
created: 2026-04-10
source: VPS-DIAGNOSIS-RESULT.md
tags: [diagnosis, vps, 95.216.191.162, not-installed]
project: websuli
---

# VPS Diagnosztika Eredmény - 95.216.191.162

## Főprobléma
**A WebSuli projekt NINCS telepítve a 95.216.191.162 VPS-en!**

## Eredmények
- SSH kapcsolat: ✅ sikeres
- `/var/www/websuli/source`: ❌ NEM LÉTEZIK
- `/var/www`: ❌ NEM LÉTEZIK

## Következtetés
Ez a VPS a REPZ projektet futtatja, nem WebSuli-t.

## Megoldás
**Opció A**: WebSuli telepítése erre a VPS-re
```bash
ssh root@95.216.191.162
mkdir -p /var/www && cd /var/www
git clone https://github.com/kosazoltan/WEBSULI.git websuli
cd websuli/source && npm install
# .env létrehozás, build, pm2 start
```

**Opció B**: GitHub Actions VPS_HOST frissítése a helyes IP-re
