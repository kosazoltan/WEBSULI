# VPS Telepítési Útmutató

Ez a dokumentum lépésről lépésre bemutatja, hogyan telepítsd a Websuli alkalmazást egy Linux (Ubuntu) VPS-re.

## 1. Előkészületek

Szükséged lesz egy VPS szolgáltatásra (pl. DigitalOcean, Hetzner, Rackforest, stb.) és egy domain névre.
Ajánlott operációs rendszer: **Ubuntu 22.04 LTS** vagy 20.04 LTS.

Lépj be a szerverre SSH-val:
```bash
ssh root@szerver_ip_cime
```

## 2. Környezet Telepítése

Készítettünk egy telepítő scriptet, ami feltelepít minden szükséges szoftvert (Node.js, PostgreSQL, Nginx, PM2).

1. Másold fel a `deploy/setup_ubuntu.sh` fájlt a szerverre, vagy hozd létre ott:
   ```bash
   nano setup.sh
   # Másold bele a tartalmat, majd mentsd el (Ctrl+X, Y, Enter)
   ```

2. Futtasd a telepítőt:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```
   A script kérni fog egy jelszót az adatbázis felhasználóhoz. Ezt jegyezd meg!

## 3. Alkalmazás Telepítése

Hozd létre a könyvtárat az alkalmazásnak:
```bash
mkdir -p /var/www/websuli
cd /var/www/websuli
```

Másold fel a projekt fájljait (használd az FTP-t, SCP-t vagy Git-et).
**Fontos:** A `node_modules` mappát NE másold fel, azt a szerveren telepítjük.

## 4. Konfiguráció

Készítsd el a `.env` fájlt a szerveren:

```bash
nano .env
```

Tartalom:
```env
# Használd a telepítéskor megadott jelszót
DATABASE_URL=postgresql://websuli:JELSZO@localhost:5432/websuli
SESSION_SECRET=valami_hosszu_titkos_szoveg
NODE_ENV=production
PORT=5000
# AI Kulcsok (opcionális)
# OPENAI_API_KEY=...
```

## 5. Build és Indítás

Futtasd a következő parancsokat a `/var/www/websuli` mappában:

```bash
# Függőségek telepítése
npm install

# Build készítése
npm run build

# Adatbázis séma feltöltése
npm run db:push

# Alkalmazás indítása PM2-vel
pm2 start deploy/ecosystem.config.cjs

# PM2 beállítása, hogy újrainduljon szerver újraindításkor
pm2 save
pm2 startup
# (Futtasd a parancsot, amit a pm2 startup kiír)
```

## 6. Nginx (Webszerver) Beállítása

Az Nginx fogja kezelni a beérkező kéréseket és továbbítani az alkalmazásnak.

1. Másold a konfigot:
   ```bash
   sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/websuli
   ```

2. Szerkeszd meg és írd át a domain nevet:
   ```bash
   sudo nano /etc/nginx/sites-available/websuli
   # Írd át a "server_name" sort a saját domainedre
   ```

3. Aktiváld az oldalt:
   ```bash
   sudo ln -s /etc/nginx/sites-available/websuli /etc/nginx/sites-enabled/
   sudo nginx -t # Ellenőrzés
   sudo systemctl restart nginx
   ```

## 7. HTTPS Beállítása (SSL)

Ingyenes SSL tanúsítvány (Certbot) telepítése:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tedomained.hu -d www.tedomained.hu
```
A Certbot automatikusan beállítja a HTTPS-t.

## Kész! 🚀

Most már elérhetőnek kell lennie az oldalnak a megadott domain címen.
