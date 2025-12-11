# 🔐 Google OAuth Beállítási Útmutató

## Összefoglaló

Ez az útmutató segít a Google bejelentkezés helyes konfigurálásában a WEBSULI alkalmazáshoz.

## 🛠️ 1. Környezeti változók beállítása

### Fejlesztési környezet (.env fájl)

Győződj meg róla, hogy a `.env` fájl tartalmazza ezeket:

```env
# Google OAuth beállítások
GOOGLE_CLIENT_ID=***REMOVED***
GOOGLE_CLIENT_SECRET=***REMOVED***

# Base URL - változtasd meg prod-ra deploy előtt!
BASE_URL=https://websuli.vip

# Admin email - ez a felhasználó automatikusan admin jogokat kap Google login után
ADMIN_EMAIL=kosa.zoltan.ebc@gmail.com

# Session secret (legalább 32 karakter)
SESSION_SECRET=your-super-secret-session-key-here

# Fejlesztéshez:
# NODE_ENV=development
# Produkciós deploynál PM2-n keresztül állítódik be
```

## 🌐 2. Google Cloud Console Beállítások

1. Nyisd meg a [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials) oldalt
2. Válaszd ki a OAuth 2.0 Client ID-t
3. Ellenőrizd/add hozzá az **Authorized redirect URIs**-hoz:
   - `https://websuli.vip/auth/google/callback`
   - `https://www.websuli.vip/auth/google/callback`
   - `http://localhost:5000/auth/google/callback` (fejlesztéshez)

4. Ellenőrizd/add hozzá az **Authorized JavaScript origins**-hoz:
   - `https://websuli.vip`
   - `https://www.websuli.vip`
   - `http://localhost:5000` (fejlesztéshez)

## 🔒 3. Session Cookie Beállítások

A `server/auth.ts` fájl most már tartalmazza a helyes cookie beállításokat:

- **`secure`**: `true` production-ban (HTTPS szükséges), `false` development-ben
- **`sameSite`**: `'lax'` - kritikus a Google OAuth redirect működéséhez!
- **`httpOnly`**: `true` - biztonság: JavaScript nem fér hozzá
- **`proxy`**: `true` production-ban (Nginx/reverse proxy mögött működik)

## 🚀 4. Deploy Ellenőrzőlista

### Hostinger/VPS-re deploy előtt

1. ✅ `NODE_ENV=production` be van állítva (PM2 ecosystem.config.cjs-ben)
2. ✅ `ADMIN_EMAIL` be van állítva
3. ✅ HTTPS (SSL) tanúsítvány működik
4. ✅ Nginx megfelelően továbbítja a header-eket:

   ```nginx
   proxy_set_header X-Forwarded-Proto $scheme;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header Host $host;
   ```

5. ✅ Google Cloud Console callback URL-ek megfelelnek

## 🧪 5. Diagnosztika

Futtasd a diagnosztikai scriptet:

```bash
npx tsx server/scripts/checkGoogleAuth.ts
```

## ❓ Gyakori Hibák

### "redirect_uri_mismatch" hiba

- **Ok**: A callback URL nem egyezik a Google Console-ban beállítottal
- **Megoldás**: Ellenőrizd, hogy PONTOSAN egyezik (https vs http, trailing slash, stb.)

### Session elvész a Google redirect után

- **Ok**: Hiányzik vagy rossz a `sameSite` cookie beállítás
- **Megoldás**: ✅ Már javítva - `sameSite: 'lax'`

### Cookie nem állítódik be HTTPS-en

- **Ok**: `secure: false` production-ban
- **Megoldás**: ✅ Már javítva - dinamikus `secure` beállítás

### "Failed to serialize user into session"

- **Ok**: A user objektum nem megfelelő formátumú
- **Megoldás**: Ellenőrizd a `getUserByGoogleId` és `upsertUser` függvényeket

## 📞 Támogatás

Ha a fenti lépések után is probléma van:

1. Ellenőrizd a szerver logokat: `pm2 logs websuli`
2. Nézd meg a böngésző konzolt 403/401 hibákért
3. Ellenőrizd a Network tab-ot a redirect láncban
