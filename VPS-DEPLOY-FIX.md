# 🔧 VPS Deployment Fix - 95.216.191.162

Ez a VPS jelenleg **nem mutatja a változásokat**. Ez az útmutató segít diagnosztizálni és javítani a problémát.

## 🚀 Gyors Használat - Automatikus Scriptek

### Windows PowerShell Script (Helyi gépről futtatva)

```powershell
# Csak diagnosztika
.\diagnose-vps.ps1

# Diagnosztika + automatikus fix
.\diagnose-vps.ps1 -Fix
```

### Bash Script (VPS-en futtatva)

```bash
# Diagnosztika (SSH-n keresztül)
ssh root@95.216.191.162 'bash -s' < diagnose-vps.sh

# Fix (SSH-n keresztül)
ssh root@95.216.191.162 'bash -s' < fix-vps-deployment.sh
```

**Vagy másold a VPS-re és futtasd ott:**
```bash
ssh root@95.216.191.162
cd /var/www/websuli/source
# Másold ide a scriptet, majd:
bash diagnose-vps.sh
bash fix-vps-deployment.sh
```

## 🚨 Gyors Diagnosztika

### 1. SSH Kapcsolat Tesztelése

```bash
ssh root@95.216.191.162
```

### 2. Projekt Könyvtár Ellenőrzése

```bash
# Navigálj a projekt könyvtárba
cd /var/www/websuli/source

# Ellenőrizd, hogy létezik-e
pwd
ls -la

# Nézd meg a git státuszt
git status
git log --oneline -5
```

### 3. PM2 Státusz Ellenőrzése

```bash
pm2 list
pm2 info websuli
pm2 logs websuli --lines 50
```

## 🔍 Lehetséges Problémák és Megoldások

### Probléma 1: A GitHub Actions nem deploy-ol erre a VPS-re

**Ellenőrzés:**
- Menj a GitHub repository Actions fülre: https://github.com/kosazoltan/WEBSULI/actions
- Nézd meg, hogy a deployment sikeres volt-e
- Ellenőrizd a secrets-et: `VPS_HOST` tartalmazza-e a `95.216.191.162` IP-t?

**Megoldás:**
Ha a `VPS_HOST` secret nem tartalmazza ezt az IP-t, frissítsd:
1. GitHub → Settings → Secrets and variables → Actions
2. Szerkeszd a `VPS_HOST` secret-et
3. Állítsd be: `95.216.191.162`

### Probléma 2: A Git Pull nem húzza le a legújabb változásokat

**Ellenőrzés:**
```bash
cd /var/www/websuli/source
git fetch origin
git log HEAD..origin/main --oneline
```

**Megoldás:**
```bash
cd /var/www/websuli/source
git pull origin main
```

### Probléma 3: A Build nem fut le vagy régi build van

**Ellenőrzés:**
```bash
cd /var/www/websuli/source
ls -lah dist/
# Nézd meg a dist/public/index.html fájl dátumát
stat dist/public/index.html
```

**Megoldás:**
```bash
cd /var/www/websuli/source
rm -rf dist node_modules/.vite
npm run build
```

### Probléma 4: PM2 nem indítja újra az alkalmazást

**Ellenőrzés:**
```bash
pm2 list
pm2 logs websuli --lines 50
```

**Megoldás:**
```bash
cd /var/www/websuli/source
pm2 delete websuli
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
pm2 save
```

### Probléma 5: Service Worker Cache

**Ellenőrzés:**
```bash
cd /var/www/websuli/source
grep "CACHE_VERSION" dist/public/service-worker.js
```

**Megoldás:**
A Service Worker cache-t a böngészőben kell törölni:
1. DevTools (F12) → Application → Service Workers → Unregister
2. Hard refresh: Ctrl+Shift+R

### Probléma 6: Nginx Cache

**Ellenőrzés:**
```bash
nginx -t
systemctl status nginx
```

**Megoldás:**
```bash
# Nginx újratöltése
systemctl reload nginx
# vagy
nginx -s reload
```

## 🚀 Teljes Deployment Folyamat (Manuális)

Ha a GitHub Actions nem működik, futtasd ezt SSH-n keresztül:

```bash
# 1. Kapcsolódj a VPS-re
ssh root@95.216.191.162

# 2. Navigálj a projekt könyvtárba
cd /var/www/websuli/source

# 3. Húzd le a legújabb változásokat
git pull origin main

# 4. Telepítsd a függőségeket
npm install

# 5. Töröld a régi buildet
rm -rf dist node_modules/.vite

# 6. Build-eld az alkalmazást
npm run build

# 7. Ellenőrizd, hogy a build sikeres volt
ls -lah dist/public/assets/ | head -10

# 8. Állítsd le a régi PM2 process-t
pm2 delete websuli

# 9. Indítsd újra az alkalmazást
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env

# 10. Várj 3 másodpercet
sleep 3

# 11. Ellenőrizd, hogy fut-e
pm2 list | grep websuli

# 12. Nézd meg a logokat
pm2 logs websuli --lines 50

# 13. Mentsd el a PM2 konfigurációt
pm2 save
```

## 📋 Deployment Script Használata

Ha van deploy script a VPS-en:

```bash
cd /var/www/websuli/source
bash deploy/deploy-to-vps.sh
```

## 🔍 Verifikáció Lépések

A deployment után ellenőrizd:

1. **Build létezik:**
   ```bash
   ls -lah /var/www/websuli/source/dist/public/
   ```

2. **PM2 fut:**
   ```bash
   pm2 list
   ```

3. **Alkalmazás válaszol:**
   ```bash
   curl http://localhost:5000
   ```

4. **Nginx működik:**
   ```bash
   curl -I https://websuli.vip
   ```

5. **Legújabb commit deploy-olva:**
   ```bash
   cd /var/www/websuli/source
   git log -1 --oneline
   # Összehasonlíthatod a GitHub-on lévő legújabb commit-tal
   ```

## 🎯 Gyors Fix Script

Létrehozhatsz egy fix scriptet a VPS-en:

```bash
ssh root@95.216.191.162
cd /var/www/websuli/source
cat > fix-deployment.sh << 'EOF'
#!/bin/bash
set -e
echo "🚀 Fixing deployment..."
cd /var/www/websuli/source
git pull origin main
npm install
rm -rf dist node_modules/.vite
npm run build
pm2 delete websuli || true
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
sleep 3
pm2 save
echo "✅ Done!"
pm2 list | grep websuli
EOF
chmod +x fix-deployment.sh
./fix-deployment.sh
```

## ⚠️ Fontos Megjegyzések

- A `VPS_HOST` secret a GitHub-ban **kell** hogy tartalmazza a `95.216.191.162` IP-t
- A deployment után **mindig** töröld a böngésző cache-t
- A Service Worker-t is **unregister**-eld a DevTools-ban
- Hard refresh: **Ctrl+Shift+R** (vagy Cmd+Shift+R Mac-en)
