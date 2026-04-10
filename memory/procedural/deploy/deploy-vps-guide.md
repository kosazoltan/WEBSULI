---
id: procedural_deploy_20260410_104
type: procedural
domain: deploy
created: 2026-04-10
source: DEPLOY-VPS.md
tags: [deployment, vps, pm2, ssh, nginx, manual]
project: websuli
---

# Közvetlen VPS Deployment Útmutató

## SSH kapcsolat
```bash
ssh root@VPS_IP_CIME
cd /var/www/websuli/source
```

## Manuális lépések
1. `git pull origin main`
2. `npm install`
3. `rm -rf dist node_modules/.vite`
4. `npm run build`
5. `npm run db:push || true`
6. `pm2 delete websuli || true`
7. `pm2 start deploy/ecosystem.config.cjs --name websuli --update-env`
8. `sleep 3 && pm2 save`

## Hibaelhárítás
- Build sikertelen: `node --version` (Node 20 kell), `rm -rf node_modules && npm install`
- PM2 nem indul: `pm2 logs websuli --lines 100`, `cat .env`
- Nem elérhető: `netstat -tulpn | grep 5000`, `nginx -t`, `systemctl status nginx`

## Sikeres deployment jelei
- dist mappa létrejött
- PM2 process online
- Nginx továbbítja a kéréseket
- Alkalmazás válaszol 5000-es porton
