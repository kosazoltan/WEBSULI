# Régi anyag eredménye azonnal — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal.md`. Munkakönyvtár: `source/`.

## 1. `server/lib/material-capture.ts` (`MATERIAL_CAPTURE_SCRIPT`)
- **A `scan`:** új, beküldendő állapot esetén az eddigi pillanatkép (név, válaszok, bejelölések) azonnal egy beküldéssé áll össze,
  és rögtön megy.
- **A `flush`:** a `post(..., true)`-t hívja.
  - A `pending` / `settleTimer` 30 mp-es összevárás megszűnik.
  - Az újrapróba (30 mp, `RETRY_MAX`) a sikertelen küldésre marad.
  - A `window.__websuliExplicitResult` továbbra is letiltja az automatikus küldést.
- **A `leave()`:** a függő (1,5 mp-es) beolvasást lefuttatja, ami azonnal küld.
- **Korlát:** `MAX_AUTO` = 30.
- **Fejlécmegjegyzés:** a szerveres összevárást írja le.

## 2. `server/lib/material-result.ts`
- **Új tiszta osztály:** `ResultCoalescer` `{ submit(key, payload), flushAll() }`.
  - Időzítő-injektálható (`setTimer`, `clearTimer`, `now`).
  - Kulcsonként a legutolsó payloadot tartja.
  - 30 mp nyugalom vagy 3 perc felső korlát után egyszer hívja a `deliver(payload)`-ot.
  - A `flushAll` minden függőt azonnal kézbesít.

## 3. `server/routes.ts` `POST /api/material-result`
- **Közös rész:** a validálás és az anyag-ellenőrzés változatlan.
- **`auto`:** `coalescer.submit(materialId|clientId||ip, value)`, válasz 202 `{ success: true, queued: true }`.
  - **A `deliver`:** a meglévő `deliverToRecipients` hívás (a cím és az e-mail-törzs a kézbesítéskori anyagcímmel).
- **Nem `auto`:** változatlan, azonnali.
- **Leállítás:** `process.once('SIGTERM')` → `flushAll()`.

## 4. Tesztek
- **`tests/material-result-capture.spec.ts`:** a dokumentált spec-változás miatt a „30 mp-ig nem küld” elvárások
  „azonnal küld, azonos állapotot nem ismétel” elvárásokra módosulnak.
  - A futó statisztika minden új állapota megy (a szerver vonja össze), a legutolsó tartalmazza a 3 / 3-at.
  - **Új eset:** kiértékelés után a keret azonnal eltűnik, és a beküldés már elment.
- **`tests/material-mailto.test.ts`:** `ResultCoalescer`.
  - Három beküldés 30 mp-en belül egy kézbesítés a legutolsóval.
  - A 3 perces felső korlát.
  - Külön kulcs külön levél.
  - A `flushAll` azonnal kézbesít.

## 5. Ellenőrzés
- `check`, `check:test`, `lint`, `npm test`, a capture Playwright-spec.
- **Élesítés után:** mobil Playwright a websuli.vip-n, a kerettörléses forgatókönyv. A `material-result` útvonalat elfogva
  ellenőrizzük, hogy a kérés elindul.
