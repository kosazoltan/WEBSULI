---
id: procedural_deploy_20260410_114
type: procedural
domain: deploy
created: 2026-04-10
source: source/README-VPS.md
tags: [vps, ubuntu, installation, nginx, ssl, pm2]
project: websuli
---

# VPS Telepítési Útmutató

## 1. Előkészületek
- Ubuntu 22.04 LTS VPS
- `ssh root@szerver_ip_cime`

## 2. Környezet telepítése
```bash
# deploy/setup_ubuntu.sh futtatása (Node.js, PostgreSQL, Nginx, PM2)
chmod +x setup.sh && ./setup.sh
```

## 3. Alkalmazás telepítése
```bash
mkdir -p /var/www/websuli && cd /var/www/websuli
# Fájlok feltöltése (NE node_modules!)
```

## 4. .env konfiguráció
```env
DATABASE_URL=postgresql://websuli:JELSZO@localhost:5432/websuli
SESSION_SECRET=hosszu_titkos
NODE_ENV=production
PORT=5000
```

## 5. Build és indítás
```bash
npm install && npm run build && npm run db:push
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup
```

## 6. Nginx konfiguráció
```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/websuli
# server_name módosítása
sudo ln -s /etc/nginx/sites-available/websuli /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

## 7. SSL (Certbot)
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tedomained.hu
```
