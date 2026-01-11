# 🔧 Közvetlen VPS Deployment Útmutató

Ha a GitHub Actions deployment nem működik, vagy azonnali deploy-ra van szükség, futtasd közvetlenül SSH-n keresztül a VPS-en.

## 📋 Gyors Deployment (SSH-n keresztül)

### 1. Kapcsolódj a VPS-re SSH-val

```bash
ssh root@VPS_IP_CIME
# vagy
ssh felhasznalo@websuli.vip
```

### 2. Navigálj a projekt könyvtárba

```bash
cd /var/www/websuli/source
```

### 3. Futtasd a deployment scriptet

```bash
# Ha már van deploy script:
bash deploy/deploy-to-vps.sh

# VAGY manuálisan lépésről lépésre:
```

## 🔨 Manuális Deployment Lépések

Ha a script nem működik, futtasd ezeket a parancsokat sorban:

```bash
# 1. Navigálj a projekt könyvtárba
cd /var/www/websuli/source

# 2. Pull-öld a legújabb kódot
git pull origin main

# 3. Telepítsd a függőségeket
npm install

# 4. Töröld az előző buildet
rm -rf dist
rm -rf node_modules/.vite

# 5. Build-eld az alkalmazást
npm run build

# 6. Ellenőrizd, hogy sikeres volt-e a build
ls -la dist/public/assets/ | head -10

# 7. Futtasd a database migrációkat (opcionális)
npm run db:push || true

# 8. Állítsd le a régi PM2 process-t
pm2 delete websuli || true

# 9. Indítsd újra az alkalmazást
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env

# 10. Várj 3 másodpercet, hogy az alkalmazás elinduljon
sleep 3

# 11. Ellenőrizd, hogy fut-e
pm2 list | grep websuli

# 12. Mentsd el a PM2 konfigurációt
pm2 save

# 13. Nézd meg a logokat (ha szükséges)
pm2 logs websuli --lines 50
```

## 🐛 Hibaelhárítás

### Ha a build sikertelen:

```bash
# Ellenőrizd a Node.js verziót (Node 20 kell)
node --version

# Töröld a node_modules-t és telepítsd újra
rm -rf node_modules package-lock.json
npm install

# Próbáld meg újra build-elni
npm run build
```

### Ha a PM2 nem indítja el az alkalmazást:

```bash
# Nézd meg a logokat
pm2 logs websuli --lines 100

# Ellenőrizd az environment változókat
cat .env

# Próbáld meg manuálisan elindítani
node dist/index.js
```

### Ha az alkalmazás nem elérhető:

```bash
# Ellenőrizd, hogy az alkalmazás fut-e
pm2 list

# Ellenőrizd a portot
netstat -tulpn | grep 5000

# Ellenőrizd az Nginx konfigurációt
nginx -t
systemctl status nginx
```

## 🔍 Deployment Ellenőrzés

### Build output ellenőrzése:

```bash
cd /var/www/websuli/source
ls -lah dist/public/assets/ | head -20
```

### Service Worker verzió ellenőrzése:

```bash
grep "CACHE_VERSION" dist/public/service-worker.js
```

### HTML verzió ellenőrzése:

```bash
grep "data-version" dist/public/index.html
```

### PM2 státusz:

```bash
pm2 status
pm2 info websuli
```

### Alkalmazás logok:

```bash
pm2 logs websuli --lines 100
```

## ✅ Sikeres Deployment Jelei

1. ✅ Build sikeres (`dist` mappa létrejött)
2. ✅ PM2 process `online` státuszban van
3. ✅ Nincs error a logokban
4. ✅ Az alkalmazás válaszol a port 5000-en
5. ✅ Nginx továbbítja a kéréseket

## 🚨 Gyors Fix Parancsok

```bash
# Teljes újraindítás
cd /var/www/websuli/source
pm2 delete websuli
npm run build
pm2 start deploy/ecosystem.config.cjs --name websuli
pm2 save

# Logok nézése
pm2 logs websuli --lines 100 --nostream

# Process info
pm2 describe websuli
```
