# 📋 VPS IP Címek Összefoglaló

## 🔍 Ismert VPS IP Címek

### 1. **95.216.191.162** (Hetzner VPS)
- **Projekt:** REPZ (NEM WebSuli!)
- **Hely:** `/opt/repz/`
- **Futó szolgáltatások:**
  - REPZ API Server (Node.js)
  - PostgreSQL (port 5432)
  - Docker container-ek (repz-server, repz-api, repz-redis)
  - HTTP port 80 (Docker proxy)
- **WebSuli projekt:** ❌ NINCS telepítve
- **SSH:** ✅ Elérhető

### 2. **31.97.44.1** (Hostinger VPS - valószínűleg)
- **Projekt:** ❓ Ismeretlen
- **SSH:** ❌ Nem elérhető (timeout/connection refused)
- **Státusz:** Valószínűleg:
  - Nem létezik
  - Nincs SSH hozzáférés
  - Tűzfal blokkolja
  - Más portot használ
  - Nincs konfigurálva

### 3. **WebSuli VPS** (Ismeretlen IP)
- **Projekt:** WebSuli
- **Hely:** Valószínűleg `/var/www/websuli/`
- **Státusz:** ❓ Ismeretlen
- **GitHub Actions:** Valószínűleg erre deploy-ol

## 🔍 Hogyan Találjuk Meg a WebSuli VPS-t?

### 1. GitHub Actions Secrets Ellenőrzése
1. GitHub repository: https://github.com/kosazoltan/WEBSULI
2. Settings → Secrets and variables → Actions
3. Nézd meg a `VPS_HOST` secret értékét

### 2. Hostinger hPanel Ellenőrzése
1. Jelentkezz be a Hostinger hPanel-be
2. VPS menüpont
3. Nézd meg az összes VPS IP címét
4. Keresd meg, melyiken van WebSuli telepítve

### 3. Domain DNS Ellenőrzése
A `websuli.vip` domain DNS rekordjai:
- Nézd meg, melyik IP-re mutat
- Ez lesz a valódi WebSuli VPS IP

### 4. GitHub Actions Logok
1. GitHub → Actions
2. Nézd meg a legutóbbi deployment logokat
3. A logokban látszik, hogy melyik IP-re deploy-ol

## 💡 Javaslatok

1. **Dokumentáld a VPS IP-t:**
   - Frissítsd a `README-HOSTINGER.md`-t a valódi IP-vel
   - Vagy hozz létre egy `VPS-IPS.md` fájlt (NE commitold a gitbe biztonsági okokból!)

2. **Ellenőrizd a GitHub Actions secrets-t:**
   - Győződj meg róla, hogy a helyes IP van beállítva

3. **Teszteld a kapcsolatot:**
   - SSH-z be a valódi WebSuli VPS-re
   - Futtasd a diagnosztikát

## ⚠️ Biztonsági Megjegyzés

**NE commitolj konkrét VPS IP címeket a repository-ba!**
- Használj GitHub Secrets-t
- Vagy dokumentáld helyileg (nem git fájlként)
