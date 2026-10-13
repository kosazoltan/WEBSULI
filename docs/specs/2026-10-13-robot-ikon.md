# WebSuli saját ikon (robot) — terv

## Háttér (ellenőrzött tények, 2026-10-13)
- `source/client/public/favicon.png` (32×32 körüli, 1145 bájt) a **Replit logója**; ezt használja az `index.html`
  `alternate icon` és `apple-touch-icon` linkje, valamint a `manifest.json` 192/512-es (maskable) ikonja.
- `favicon.svg` egy régi kék könyv-ikon (`index.html` elsődleges `icon`, manifest `any`).
- `https://websuli.vip/favicon.ico` → 200 `text/html` (Vercel SPA-fallback) — nincs valódi .ico; a push-értesítések
  (`client/public/service-worker.js` 151–152, `server/pushNotifications.ts` 68–69, 144–145) erre mutatnak.
- A service worker `STATIC_ASSETS`-ben gyorsítótárazza a `/favicon.svg`, `/favicon.png` fájlt (`CACHE_VERSION` 4.2.0).

## Cél
A tulajdonos által jóváhagyott „kedves robot” ikon legyen az oldal minden ikonja: böngészőfül, Apple kezdőképernyő,
PWA (Android) telepítés, push-értesítés.

## Nem-cél
- Nincs app-név, `theme_color`, szöveg vagy felület-design módosítás.
- Nem nyúlunk a push-küldés logikájához, csak az alapértelmezett ikon-útvonalhoz.

## Fájlok
- `client/public/favicon.svg` — robot (lekerekített csempe, átlátszó sarkok)
- `client/public/favicon.png` — 32×32 robot
- `client/public/favicon.ico` — új: 16/32/48 (PNG-tartalmú ICO)
- `client/public/apple-touch-icon.png` — új: 180×180, teljes kitöltésű (iOS maga kerekít; átlátszó sarok = fekete)
- `client/public/icon-192.png`, `icon-512.png` — új: `any` (lekerekített)
- `client/public/icon-maskable-512.png` — új: teljes kitöltés, tartalom a 80%-os biztonsági körön belül
- `client/public/manifest.json` — ikonlista
- `client/index.html` — `apple-touch-icon` → `/apple-touch-icon.png` (sizes 180x180); `alternate icon` sizes 32x32
- `client/public/service-worker.js` — `CACHE_VERSION` emelés, `STATIC_ASSETS` bővítés, push alap-ikon `/icon-192.png`
- `server/pushNotifications.ts` — push alap-ikon `/icon-192.png` (badge marad `/favicon.ico`, ami most már létezik)
- `tests/app-icons.test.ts` — új
- forrás: `client/public/brand/robot-icon-source.svg` NEM kerül be (a `favicon.svg` maga a forrás); a teljes kitöltésű
  változat SVG-je generátor-szkriptben él: `scripts/generate-app-icons.mjs`

## Edge case-ek
- Régi telepített PWA / SW-cache: a `CACHE_VERSION` emelés a SW `activate` ágán törli a régi cache-t.
- Böngésző-favicon cache: a böngészők saját favicon-cache-e nem kényszeríthető; friss betöltésnél/új lapon frissül.
- iOS apple-touch-icon átlátszósága → ezért teljes kitöltésű változat.

## Elfogadás (EARS)
- A `favicon.svg`, `favicon.png`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png` létezik, a PNG-k mérete a fájlnévnek/szerepnek megfelelő, az ICO 16/32/48 bejegyzést tartalmaz.
- A `manifest.json` minden ikon-`src`-je létező fájl, a `sizes` egyezik a valós mérettel; van `maskable` és `any` cél.
- Élesben `/favicon.ico` `image/x-icon` (vagy `image/vnd.microsoft.icon`), `/favicon.png` az új (≠ 1145 bájtos Replit) fájl.
- Böngészős ellenőrzés: a betöltött oldal `<link rel=icon>` és `apple-touch-icon` célpontja 200-zal kép típusú.
- `npm test` célzott teszt zöld; `check`, `check:test`, eslint 0; build OK.
