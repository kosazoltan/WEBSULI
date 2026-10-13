# WebSuli robot-ikon — végrehajtási utasítás (AI-olvasható)

Spec: `docs/specs/2026-10-13-robot-ikon.md`. Munkakönyvtár: `source/`. Sorrend kötelező.

## 1. `scripts/generate-app-icons.mjs` (új)
- Tartalmazza a két SVG-t konstansként: `ROUNDED` (= a jóváhagyott robot, 512-es viewBox, `rect rx=112` háttér) és
  `FULL_BLEED` (ugyanaz `rx=0` háttérrel, a robot csoport `translate(256 256) scale(0.8) translate(-256 -256)`-tel
  a maskable biztonsági zónába húzva).
- Playwright `chromium` (a repo devDependency-je) rendereli `omitBackground: true`-val:
  `favicon.png` 32 (ROUNDED), `icon-192.png` 192 (ROUNDED), `icon-512.png` 512 (ROUNDED),
  `apple-touch-icon.png` 180 (FULL_BLEED, `rx=0`, robot NEM kicsinyítve — iOS kerekít), `icon-maskable-512.png` 512 (FULL_BLEED, kicsinyített).
- ICO: 16, 32, 48 PNG (ROUNDED) → `favicon.ico`: ICONDIR (reserved 0, type 1, count 3) + 3×16 bájtos ICONDIRENTRY
  (width, height, 0, 0, planes 1, bitcount 32, bytes, offset) + PNG-adatok.
- A `favicon.svg`-be a `ROUNDED` kerül.
- Futtatás: `node scripts/generate-app-icons.mjs` → kiírja a fájlokat a `client/public/`-ba.

## 2. `client/public/manifest.json`
- `icons`: `/favicon.svg` (any, svg) · `/icon-192.png` 192x192 any · `/icon-512.png` 512x512 any ·
  `/icon-maskable-512.png` 512x512 maskable.

## 3. `client/index.html`
- `<link rel="alternate icon" type="image/png" sizes="32x32" href="/favicon.png">`
- `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`

## 4. `client/public/service-worker.js`
- `CACHE_VERSION` → `'4.3.0'`; `STATIC_ASSETS` + `'/favicon.ico'`, `'/icon-192.png'`.
- push alapértelmezés: `icon: '/icon-192.png'` (badge marad `/favicon.ico`).

## 5. `server/pushNotifications.ts`
- a két `icon: payload.icon || '/favicon.ico'` → `'/icon-192.png'`.

## 6. `tests/app-icons.test.ts` (új, `node:test`)
- PNG IHDR-ből szélesség/magasság: favicon.png 32, icon-192 192, icon-512 512, apple-touch-icon 180, maskable 512.
- favicon.ico: első 4 bájt `00 00 01 00`, count 3, méretek {16,32,48}.
- manifest: minden `src` létező fájl a `client/public`-ban; PNG-knél a `sizes` = valós méret; van `maskable` és `any`.
- index.html: `apple-touch-icon` és `alternate icon` célpontja létező fájl.
- favicon.svg nem tartalmazza a régi könyv-ikon jelölőt („Book icon”).
Ellenőrzés: `node --import tsx --test tests/app-icons.test.ts`.

## 7. Verifikáció
- `npm.cmd run check`, `npm.cmd run check:test`, célzott eslint, teljes `npm.cmd test`, `npm.cmd run build`.
- Merge + deploy után: `curl -I https://websuli.vip/favicon.ico` (kép típus), `/favicon.png` méret ≠ 1145,
  `/apple-touch-icon.png`, `/icon-192.png` 200 image/png; Chrome-ban friss lapon a fül ikonja képernyőképpel.
