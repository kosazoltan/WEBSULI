---
id: procedural_deploy_20260410_111
type: procedural
domain: deploy
created: 2026-04-10
source: source/GITHUB-ACTIONS-SETUP.md
tags: [github-actions, setup, vps, pm2, ci-cd]
project: websuli
---

# GitHub Actions Automatikus Deploy Beállítás

## Szükséges Secrets
1. `VPS_HOST` - VPS IP (pl. 123.456.789.012)
2. `VPS_USERNAME` - SSH user (root)
3. `VPS_SSH_KEY` - privát kulcs tartalma (BEGIN...END)
4. `VPS_PORT` - opcionális (22)

## VPS előkészítés
```bash
ssh root@VPS_IP
cd /var/www && git clone https://github.com/kosazoltan/WEBSULI.git websuli
cd websuli/source && npm install && npm run build
# .env fájl létrehozás, pm2 start, pm2 save, pm2 startup
```

## Deployment workflow (automatikus)
1. Push → GitHub Actions → git pull → npm install → build → DB migrate → PM2 restart

## Deploy státusz ellenőrzés
https://github.com/kosazoltan/WEBSULI/actions
