# VPS Konfiguráció Információk

## 🌐 VPS Szerver Adatok

**IP Cím:** `95.216.191.162`

**Domain:** `websuli.vip` (Cloudflare CDN-en keresztül)

**SSH Kapcsolat:**
```bash
ssh root@95.216.191.162
# vagy
ssh root@websuli.vip
```

## 📋 GitHub Actions Secrets

A GitHub Actions workflow ezeket a secret-eket használja:

- **VPS_HOST:** `95.216.191.162` (vagy `websuli.vip`)
- **VPS_USERNAME:** `root` (vagy más felhasználó)
- **VPS_SSH_KEY:** Privát SSH kulcs
- **VPS_PORT:** `22` (alapértelmezett)

## 🔧 Deployment Útvonal

A deployment a következő útvonalra történik:

```bash
/var/www/websuli/source
```

## 🌍 Nginx Konfiguráció

Az Nginx konfiguráció a következő helyen található:

```bash
/etc/nginx/sites-available/websuli.vip
# vagy
/etc/nginx/sites-enabled/websuli.vip
```

**Proxy cél:** `http://localhost:5000`

## 🚀 PM2 Process

Az alkalmazás PM2-vel fut:

```bash
pm2 list
pm2 logs websuli
pm2 restart websuli
```

**Process név:** `websuli`

**Ecosystem config:** `/var/www/websuli/source/deploy/ecosystem.config.cjs`

## 📊 Szerver Információk

- **Operációs rendszer:** Ubuntu 22.04 LTS (valószínűleg)
- **Node.js verzió:** 20.x
- **Port:** 5000 (backend), 80/443 (Nginx)
- **Database:** PostgreSQL (localhost)

## 🔍 Gyors Ellenőrzések

### SSH Kapcsolat tesztelése:
```bash
ssh -v root@95.216.191.162
```

### Szerver státusz:
```bash
ssh root@95.216.191.162 "pm2 list && nginx -t"
```

### Deployment script futtatása:
```bash
ssh root@95.216.191.162 "cd /var/www/websuli/source && bash deploy/deploy-to-vps.sh"
```

## 📝 Megjegyzések

- A GitHub Actions automatikus deployment használja ezt az IP-t a `VPS_HOST` secret-ben
- A domain (`websuli.vip`) Cloudflare-n keresztül van irányítva erre a VPS-re
- Az Nginx reverse proxy-ként működik, a 443-as porton (HTTPS)
- A Let's Encrypt SSL tanúsítványok automatikusan kezelve vannak
