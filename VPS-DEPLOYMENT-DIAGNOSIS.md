# 🔍 VPS Deployment Diagnosztika - Miért nem fut a legfrissebb program?

## 📋 Áttekintés

A WebSuli alkalmazás legfrissebb változásai nem jelennek meg a VPS-en (`websuli.vip`).

## 🔍 Ellenőrzési Lépések

### 1. GitHub Actions Deployment Státusz

**Ellenőrizd a GitHub Actions logokat:**

1. Menj a repository-hoz: https://github.com/kosazoltan/WEBSULI
2. Kattints az **Actions** fülre
3. Nézd meg a legutóbbi **"Deploy to VPS"** workflow futását
4. Ellenőrizd:
   - ✅ Sikeres volt-e a deployment?
   - ⏱️ Mikor futott le utoljára?
   - 📝 Vannak-e hibák a logokban?

**Kérdések:**
- Futott-e le egyáltalán deployment a legutóbbi push után?
- Sikeres volt-e, vagy voltak hibák?
- Melyik VPS IP-re deploy-ol (ellenőrizd a `VPS_HOST` secret értékét)?

### 2. VPS IP Cím Ellenőrzése

**Ismert IP címek:**
- `31.97.44.1` (Hostinger - valószínűleg WebSuli VPS)
- `95.216.191.162` (Hetzner - REPZ projekt, NEM WebSuli)

**Ellenőrzés:**
1. GitHub → Settings → Secrets and variables → Actions
2. Nézd meg a `VPS_HOST` secret értékét (szerkesztéshez kattintva)
3. Egyezik-e a `31.97.44.1` IP-vel?

### 3. SSH Kapcsolat Tesztelése

**Jelenlegi probléma:** SSH kapcsolat timeout (nem elérhető)

**Lehetséges okok:**
- ❌ VPS nem elérhető (leállt, tűzfal, hálózati probléma)
- ❌ SSH kulcs nincs beállítva
- ❌ Téves IP cím

**Tesztelés:**
```bash
ssh -v websuli
# vagy
ssh -v root@31.97.44.1
```

### 4. Lehetséges Problémák

#### Probléma A: GitHub Actions nem deploy-ol erre a VPS-re

**Jelzők:**
- A GitHub Actions logokban más IP látszik
- A `VPS_HOST` secret rossz IP-t tartalmaz

**Megoldás:**
1. GitHub → Settings → Secrets → `VPS_HOST`
2. Állítsd be: `31.97.44.1`
3. Trigger-eld újra a deployment-t (push vagy workflow_dispatch)

#### Probléma B: Git Pull nem húzta le a legújabb változásokat

**Jelzők:**
- A VPS-en régi commit hash van
- A GitHub-on újabb commit-ok vannak

**Megoldás (SSH-n keresztül):**
```bash
ssh websuli
cd /var/www/websuli/source
git fetch origin
git log HEAD..origin/main --oneline  # Nézd meg, milyen commit-ok hiányoznak
git pull origin main
```

#### Probléma C: Build nem futott le vagy régi build van

**Jelzők:**
- A `dist/` könyvtár régi dátumú
- A build assets régi verziószámokat tartalmaznak

**Megoldás:**
```bash
cd /var/www/websuli/source
rm -rf dist node_modules/.vite
npm run build
```

#### Probléma D: PM2 nem indította újra az alkalmazást

**Jelzők:**
- PM2 fut, de régi kódot szolgál ki
- A restart nem történt meg

**Megoldás:**
```bash
cd /var/www/websuli/source
pm2 delete websuli
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
pm2 save
```

#### Probléma E: Service Worker Cache

**Jelzők:**
- A böngésző régi verziót mutat
- Hard refresh után sem változik

**Megoldás:**
1. DevTools (F12) → Application → Service Workers
2. Kattints az "Unregister" gombra
3. Hard refresh: `Ctrl+Shift+R` (Windows) vagy `Cmd+Shift+R` (Mac)

#### Probléma F: Nginx Cache

**Jelzők:**
- Nginx régi fájlokat szolgál ki
- Nginx cache be van állítva

**Megoldás:**
```bash
systemctl reload nginx
# vagy
nginx -s reload
```

## 🚀 Javasolt Megoldási Lépések

### Lépés 1: GitHub Actions Ellenőrzése

1. **Nézd meg a legutóbbi deployment-et:**
   - GitHub → Actions → "Deploy to VPS" workflow
   - Látod-e sikeres deployment-et a legutóbbi push után?

2. **Ha nem futott le deployment:**
   - Manuálisan trigger-eld: Actions → Deploy to VPS → Run workflow

3. **Ha hibával futott le:**
   - Nézd meg a hiba részleteit
   - Javítsd a hibát
   - Újraindítsd a workflow-t

### Lépés 2: VPS Manuális Deployment (Ha SSH elérhető)

Ha az SSH kapcsolat működik, futtasd ezt a scriptet:

```bash
ssh websuli
cd /var/www/websuli/source

# 1. Pull legújabb kód
git pull origin main

# 2. Telepítsd a függőségeket
npm install

# 3. Töröld a régi buildet
rm -rf dist node_modules/.vite

# 4. Build
npm run build

# 5. PM2 restart
pm2 delete websuli
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
sleep 3
pm2 save

# 6. Ellenőrzés
pm2 list
pm2 logs websuli --lines 20
```

### Lépés 3: Böngésző Cache Törlése

A deployment után:

1. **Service Worker Unregister:**
   - F12 → Application → Service Workers → Unregister

2. **Hard Refresh:**
   - `Ctrl+Shift+R` (Windows)
   - `Cmd+Shift+R` (Mac)

3. **Teljes Cache Clear (ha szükséges):**
   - F12 → Application → Clear storage → Clear site data

### Lépés 4: Verifikáció

Ellenőrizd, hogy a változások megjelentek:

1. **Commit hash ellenőrzése:**
   - A GitHub-on nézd meg a legújabb commit hash-t
   - A VPS-en: `cd /var/www/websuli/source && git log -1 --oneline`

2. **Build dátum ellenőrzése:**
   - VPS-en: `stat dist/public/index.html` (vagy hasonló fájl)

3. **Alkalmazás verzió ellenőrzése:**
   - A böngészőben nézd meg a változásokat
   - DevTools → Network → Reload → Ellenőrizd a fájl időbélyegeit

## 📝 Manuális Deployment Script

Hozd létre ezt a scriptet a VPS-en, ha SSH elérhető:

```bash
ssh websuli
cd /var/www/websuli/source
cat > quick-deploy.sh << 'EOF'
#!/bin/bash
set -e
echo "🚀 Quick Deployment Script"
cd /var/www/websuli/source
echo "📥 Pulling latest code..."
git pull origin main
echo "📦 Installing dependencies..."
npm install
echo "🧹 Cleaning old build..."
rm -rf dist node_modules/.vite
echo "🔨 Building..."
npm run build
echo "♻️ Restarting PM2..."
pm2 delete websuli || true
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env
sleep 3
pm2 save
echo "✅ Deployment complete!"
pm2 list | grep websuli
EOF
chmod +x quick-deploy.sh
./quick-deploy.sh
```

## ⚠️ Fontos Megjegyzések

1. **VPS IP megerősítés szükséges:**
   - Ellenőrizd a GitHub secrets-ben a `VPS_HOST` értékét
   - Győződj meg róla, hogy a helyes VPS-re deploy-ol

2. **SSH kapcsolat:**
   - Ha az SSH nem működik, először javítsd ki
   - Használd az SSH config-ot: `ssh websuli`

3. **GitHub Actions automatikus deployment:**
   - A workflow automatikusan fut a `main` branch push után
   - Manuálisan is trigger-elhető: Actions → Run workflow

4. **Cache problémák:**
   - Mindig töröld a böngésző cache-t deployment után
   - Service Worker-t is unregister-eld

## 🎯 Következő Lépések

1. ✅ **Ellenőrizd a GitHub Actions logokat**
2. ✅ **Ellenőrizd a VPS_HOST secret értékét**
3. ⏳ **Teszteld az SSH kapcsolatot** (ha lehetséges)
4. ⏳ **Futtasd a manuális deployment scriptet** (ha SSH elérhető)
5. ⏳ **Töröld a böngésző cache-t**
6. ⏳ **Verifikáld a változásokat**
