---
id: procedural_deploy_20260410_110
type: procedural
domain: deploy
created: 2026-04-10
source: VPS-DEPLOY-FIX.md
tags: [vps, deployment, fix, diagnosis, 95.216.191.162]
project: websuli
---

# VPS Deployment Fix (95.216.191.162)

## Automatikus scriptek
```bash
# Diagnosztika
ssh root@95.216.191.162 'bash -s' < diagnose-vps.sh
# Fix
ssh root@95.216.191.162 'bash -s' < fix-vps-deployment.sh
```

## Lehetséges problémák
1. GitHub Actions rossz IP-re deploy-ol → VPS_HOST secret frissítése
2. Git pull nem húzta le a változásokat → `git pull origin main`
3. Régi build → `rm -rf dist node_modules/.vite && npm run build`
4. PM2 nem indult újra → `pm2 delete websuli && pm2 start deploy/ecosystem.config.cjs`
5. Service Worker cache → DevTools → Application → Service Workers → Unregister
6. Nginx cache → `systemctl reload nginx`

## Teljes manuális deploy
```bash
ssh root@95.216.191.162
cd /var/www/websuli/source
git pull origin main && npm install && rm -rf dist node_modules/.vite
npm run build
pm2 delete websuli || true
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
sleep 3 && pm2 save
```

## Megjegyzés: ez a VPS REPZ projektet futtat, nem WebSuli-t!
Lásd: VPS-PROJECT-ANALYSIS.md, VPS-DIAGNOSIS-RESULT.md
