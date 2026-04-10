---
id: procedural_deploy_20260410_103
type: procedural
domain: deploy
created: 2026-04-10
source: DEPLOY-NOW.md
tags: [deployment, vps, pm2, ssh, quick]
project: websuli
---

# Azonnali VPS Deployment

## Egy-soros deploy
```bash
cd /var/www/websuli/source && git pull origin main && npm install && rm -rf dist node_modules/.vite && npm run build && pm2 delete websuli 2>/dev/null || true && sleep 2 && pm2 start deploy/ecosystem.config.cjs --name websuli --update-env && sleep 3 && pm2 save
```

## Script módszer
```bash
cd /var/www/websuli/source
bash deploy/deploy-to-vps.sh
```

## Ellenőrzés
```bash
pm2 list
pm2 logs websuli --lines 50
ls -la dist/public/assets/ | head -10
```
