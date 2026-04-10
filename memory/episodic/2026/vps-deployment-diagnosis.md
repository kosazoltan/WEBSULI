---
id: episodic_deploy_20260410_403
type: episodic
domain: deploy
created: 2026-04-10
source: VPS-DEPLOYMENT-DIAGNOSIS.md
tags: [diagnosis, vps, deployment, troubleshooting]
project: websuli
---

# VPS Deployment Diagnosztika - Változások nem jelennek meg

## Probléma
WebSuli legfrissebb változásai nem jelennek meg a VPS-en (websuli.vip).

## Lehetséges okok
A) GitHub Actions rossz IP-re deploy-ol → VPS_HOST ellenőrzése
B) Git pull nem futott le → `git pull origin main`
C) Build régi → `rm -rf dist node_modules/.vite && npm run build`
D) PM2 nem indult újra → `pm2 delete websuli && pm2 start ...`
E) Service Worker cache → Unregister + Ctrl+Shift+R
F) Nginx cache → `systemctl reload nginx`

## Gyors diagnosztika lépések
1. GitHub Actions logok: https://github.com/kosazoltan/WEBSULI/actions
2. VPS_HOST secret értéke: GitHub Settings → Secrets → VPS_HOST szerkesztése
3. SSH tesztelés: `ssh websuli "hostname && cd /var/www/websuli/source && git log -1 --oneline"`

## Manuális deploy script
```bash
cat > quick-deploy.sh << 'EOF'
#!/bin/bash
set -e
cd /var/www/websuli/source
git pull origin main && npm install
rm -rf dist node_modules/.vite && npm run build
pm2 delete websuli || true
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
sleep 3 && pm2 save
EOF
chmod +x quick-deploy.sh && ./quick-deploy.sh
```
