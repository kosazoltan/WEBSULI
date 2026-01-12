# 📊 VPS Projekt Analízis - 95.216.191.162

## 🌐 Aktuális Projektek a VPS-en

### ✅ **REPZ Projekt** (Fő projekt)

**Helye:** `/opt/repz/`

**Alprojektek:**
- `/opt/repz/api/` - API projekt
- `/opt/repz/desktop/` - Desktop projekt  
- `/opt/repz/ebc-source-latest/` - EBC forráskód
- `/opt/repz/forras-kod-extract/` - Forráskód extract
- `/opt/repz/package.json` - Fő projekt

### ✅ **Futó Node.js Alkalmazás**

**Process:**
- **PID:** 3231
- **Parancs:** `node src/index.js`
- **Státusz:** Fut (2025 óta)
- **Memória:** ~117 MB

### 🌐 **Hálózati Szolgáltatások**

**Futó portok:**
- **Port 22** (SSH) - Fut
- **Port 80** (HTTP) - Fut (docker-proxy által)
- **Port 5432** (PostgreSQL) - Fut
- **Port 53** (DNS) - systemd-resolve

**Webszerver:**
- Nginx: Nincs telepítve/fut
- Apache: Nincs telepítve/fut
- Docker: Van container a 80-as porton

### 🗄️ **Adatbázis**

- **PostgreSQL:** Fut a 5432-es porton

### ❌ **WebSuli Projekt**

**NINCS telepítve ezen a VPS-en!**
- `/var/www/websuli` - NEM LÉTEZIK
- PM2 - NINCS telepítve
- WebSuli process - NEM FUT

## 🔍 Következtetés

Ez a VPS **REPZ projektet** futtat, nem a WebSuli-t!

- ✅ REPZ projekt: `/opt/repz/`
- ✅ Node.js alkalmazás fut
- ✅ PostgreSQL adatbázis fut
- ✅ Docker container a 80-as porton
- ❌ WebSuli projekt: **NINCS telepítve**

## 💡 Javaslat

Ha a WebSuli-t szeretnéd ezen a VPS-en futtatni:

1. **Ellenőrizd a GitHub Actions secrets-t:**
   - Melyik VPS IP-t használja a `VPS_HOST`?
   
2. **Ha más VPS-re kell deploy-olni:**
   - Találd meg a helyes VPS IP-t
   - Frissítsd a GitHub secrets-t

3. **Ha erre a VPS-re kell telepíteni:**
   - Telepítsd a WebSuli-t külön könyvtárba
   - Használj másik portot (pl. 5000)
   - Konfiguráld az Nginx reverse proxy-t
