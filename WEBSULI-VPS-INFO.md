# 📊 WebSuli VPS Információk

## 🌐 Alapinformációk

### IP Címek (Ismert/Kezelt IP-k)

1. **31.97.44.1** (Hostinger - Valószínűleg a WebSuli VPS)
   - **SSH Config:** `Host websuli` → `HostName 31.97.44.1`
   - **Kapcsolat:** `ssh websuli` vagy `ssh root@31.97.44.1`
   - **Státusz:** Valószínűleg a WebSuli VPS
   - **Domain:** `websuli.vip`

2. **95.216.191.162** (Hetzner - REPZ projekt, NEM WebSuli)
   - **Státusz:** REPZ projekt fut rajta
   - **Megjegyzés:** Ez NEM a WebSuli VPS

### Domain

- **Domain:** `websuli.vip`
- **CDN:** Cloudflare
- **SSL:** Let's Encrypt (automatikusan kezelve)

## 🔧 Szerver Konfiguráció

### Operációs Rendszer
- **OS:** Ubuntu 22.04 LTS (valószínűleg)
- **Architektúra:** x86_64

### Telepített Szoftverek
- **Node.js:** 20.x
- **PostgreSQL:** Lokális adatbázis szerver
- **Nginx:** Web szerver / Reverse proxy
- **PM2:** Process manager

### Alkalmazás Útvonalak
- **Könyvtár:** `/var/www/websuli/source`
- **Build output:** `/var/www/websuli/source/dist`
- **Ecosystem config:** `/var/www/websuli/source/deploy/ecosystem.config.cjs`

### Portok
- **Backend:** 5000 (localhost)
- **Nginx HTTP:** 80
- **Nginx HTTPS:** 443
- **SSH:** 22

## 📦 Deployment

### GitHub Actions
- **Repository:** https://github.com/kosazoltan/WEBSULI
- **Branch:** `main`
- **Secrets:**
  - `VPS_HOST` - VPS IP címe
  - `VPS_USERNAME` - SSH felhasználónév (valószínűleg `root`)
  - `VPS_SSH_KEY` - Privát SSH kulcs
  - `VPS_PORT` - SSH port (22)

### Deployment Workflow
1. Push a `main` branch-re
2. GitHub Actions automatikus build
3. SSH-n keresztül deployment
4. PM2 restart

## 🔍 Nginx Konfiguráció

- **Konfig fájl:** `/etc/nginx/sites-available/websuli.vip`
- **Enabled link:** `/etc/nginx/sites-enabled/websuli.vip`
- **Proxy target:** `http://localhost:5000`
- **SSL:** Let's Encrypt tanúsítványok

## 🚀 PM2 Process

- **Process név:** `websuli`
- **Indítás:** `pm2 start deploy/ecosystem.config.cjs --name websuli`
- **Status:** `pm2 list`
- **Logs:** `pm2 logs websuli`
- **Restart:** `pm2 restart websuli`

## 📊 Adatbázis

- **Típus:** PostgreSQL
- **Kapcsolat:** `DATABASE_URL` environment változó
- **Formátum:** `postgresql://websuli:JELSZO@localhost:5432/websuli`
- **Migrációk:** `npm run db:push`

## 🔐 SSH Kapcsolat

### SSH Config (~/.ssh/config)
```
Host websuli
    HostName 31.97.44.1
    User root
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

### Kapcsolat tesztelése
```bash
ssh websuli "hostname && pwd"
ssh websuli "cd /var/www/websuli/source && pwd"
```

## ⚠️ Megjegyzések

1. **IP megerősítés szükséges:**
   - A `31.97.44.1` IP a valószínű WebSuli VPS
   - A GitHub Actions `VPS_HOST` secret tartalmazza a pontos IP-t
   - Az SSH config és a dokumentumok alapján ez a legvalószínűbb IP

2. **MCP Szerver:**
   - Az MCP szerver be van állítva a Cursor IDE-ben
   - Az MCP szerver csak újraindítás után lesz elérhető
   - Az MCP szerveren keresztül pontos VPS információkat lehet lekérdezni

3. **Alternatív információforrások:**
   - Hostinger hPanel: https://hpanel.hostinger.com → VPS menüpont
   - GitHub Actions secrets: VPS_HOST értéke
   - SSH kapcsolat: `ssh websuli` parancs

## 📝 Következő Lépések

1. **MCP Szerver használata (Ajánlott):**
   - Indítsd újra a Cursor-t
   - Kérdezd meg: "Listázd a Hostinger VPS-eket"
   - Kérdezd meg: "Mutasd a WebSuli VPS részleteit"

2. **SSH kapcsolat ellenőrzése:**
   ```bash
   ssh websuli "hostname && uname -a && df -h / && free -h"
   ```

3. **Hostinger hPanel ellenőrzése:**
   - Jelentkezz be: https://hpanel.hostinger.com
   - Menj a VPS menüpontra
   - Nézd meg az összes VPS-et és azok IP címét
