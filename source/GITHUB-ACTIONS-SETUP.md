# GitHub Actions Automatikus Deploy Beállítása

## 📋 Áttekintés

Beállítottam egy automatikus deploy rendszert GitHub Actions segítségével. Amikor push-olsz a `main` branch-re, automatikusan deploy-olja a változtatásokat a VPS-re.

## 🔐 GitHub Secrets Beállítása

Ahhoz, hogy a workflow működjön, be kell állítanod a következő secreteket a GitHub repository-ban:

### Secretek Hozzáadása:

1. Menj a GitHub repository-hoz: https://github.com/kosazoltan/WEBSULI
2. Kattints a **Settings** (Beállítások) fülre
3. Bal oldali menüben: **Secrets and variables** → **Actions**
4. Kattints a **New repository secret** gombra

### Szükséges Secretek:

#### 1. `VPS_HOST`
- **Érték**: A VPS szerver IP címe vagy domain neve
- **Példa**: `123.456.789.012` vagy `websuli.hu`

#### 2. `VPS_USERNAME`
- **Érték**: SSH felhasználónév (általában `root` vagy `websuli`)
- **Példa**: `root`

#### 3. `VPS_SSH_KEY`
- **Érték**: A privát SSH kulcs teljes tartalma
- **Hogyan kapd meg**:
  ```powershell
  # Windows PowerShell-ben:
  Get-Content "C:\Users\Kósa Zoltán\.ssh\id_rsa"
  
  # Vagy:
  type "C:\Users\Kósa Zoltán\.ssh\id_rsa"
  ```
- Másold ki a **teljes kimenetét** (beleértve a `-----BEGIN` és `-----END` sorokat is)
- Illeszd be a GitHub Secret mezőbe

#### 4. `VPS_PORT` (opcionális)
- **Érték**: SSH port szám (ha nem 22)
- **Alapértelmezett**: 22
- Csak akkor add hozzá, ha egyedi portot használsz

## 📁 VPS Előkészítése

### 1. Git Repository Klónozása a VPS-en

SSH-val lépj be a szervedre és klónozd le a repository-t:

```bash
ssh root@VPS_IP_CIME

# Navigálj a megfelelő helyre
cd /var/www

# Klónozd le a repository-t
git clone https://github.com/kosazoltan/WEBSULI.git websuli

# Menj a source mappába
cd websuli/source

# Telepítsd a függőségeket
npm install

# Build-eld az alkalmazást
npm run build

# Hozd létre a .env fájlt (ha még nincs)
nano .env
```

### 2. .env Fájl Beállítása

Győződj meg róla, hogy a `/var/www/websuli/source/.env` fájl létezik és tartalmazza:

```env
DATABASE_URL=postgresql://websuli:JELSZO@localhost:5432/websuli
SESSION_SECRET=valami_hosszu_titkos_szoveg
NODE_ENV=production
PORT=5000
```

### 3. PM2 Konfiguráció Ellenőrzése

Győződj meg róla, hogy a PM2 ecosystem config helyes:

```bash
cd /var/www/websuli/source
cat deploy/ecosystem.config.cjs
```

A fájlban az app name-nek `websuli`-nak kell lennie (ez van a workflow-ban is).

### 4. Első Indítás

```bash
cd /var/www/websuli/source

# Indítsd el PM2-vel
pm2 start deploy/ecosystem.config.cjs

# Mentsd el a PM2 konfigot
pm2 save

# PM2 automatikus indítás beállítása
pm2 startup
# (Futtasd a parancsot amit kiír)
```

## 🚀 Működés

Mostantól amikor push-olsz a main branch-re:

1. ✅ GitHub Actions automatikusan elindul
2. 📥 Pull-olja a legfrissebb kódot a VPS-en
3. 📦 Telepíti a függőségeket
4. 🔨 Build-eli az alkalmazást
5. 🗄️ Futtatja a DB migrációkat
6. ♻️ Újraindítja az alkalmazást PM2-vel
7. ✅ Kész - az új verzió élesben van!

## 🔍 Deploy Státusz Ellenőrzése

- Menj a repository GitHub oldalára
- Kattints az **Actions** fülre
- Láthatod az összes deploy történetet
- Kattints egy futásra, hogy lásd a részletes logokat

## 🛠️ Hibakeresés

### Ha a deploy sikertelen:

1. Ellenőrizd a GitHub Actions logokat az **Actions** fülön
2. Ellenőrizd a VPS-en a PM2 logokat:
   ```bash
   pm2 logs websuli
   ```
3. Ellenőrizd, hogy a GitHub Secrets helyesen vannak-e beállítva
4. Ellenőrizd az SSH hozzáférést:
   ```bash
   ssh root@VPS_IP_CIME
   ```

## 📝 Manuális Deploy (ha szükséges)

Ha valami miatt nem működne az automatikus deploy, manuálisan is futtathatod:

```bash
ssh root@VPS_IP_CIME
cd /var/www/websuli/source
git pull origin main
npm install
npm run build
npm run db:push
pm2 restart websuli
```

## ⚡ Gyors Parancs a GitHub-on

A workflow-t manuálisan is futtathatod a GitHub-on:
1. Menj az **Actions** fülre
2. Válaszd a "Deploy to VPS" workflow-t
3. Kattints a **Run workflow** gombra
