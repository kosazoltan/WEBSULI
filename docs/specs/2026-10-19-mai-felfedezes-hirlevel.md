# „Mai felfedezés” — napi, érdeklődés szerinti hírlevél a saját gyerekeknek

Állapot: tulajdonosi döntés 2026-10-19.
- **Ütemezés:** külön levél, naponta 16:00-kor (Europe/Budapest), hétvégén is. A reggeli tananyag-emlékeztető változatlan.
- **Hatókör:** csak a saját gyerekek. A forráslistát Claude állítja össze.
- **Élesítés:** azonnal élesben, előnézeti mód nélkül; a gyerekek visszajelzése alapján módosítunk.

## Cél
A gyerek kapjon minden nap egy rövid, neki szóló levelet: egy magyar nyelvű, korának megfelelő cikket a saját érdeklődési
köréből, és ha van illeszkedő, egy hozzá kapcsolódó anyagot a WebSuli bankjából. A cél, hogy kedvet kapjon az olvasáshoz és
a kapcsolódó tantárgyhoz.

## Nem-cél
- Más (nem családtag) tanuló: náluk alapból KI, érdeklődést nem kérünk és nem tárolunk.
- A cikk szövegének átvétele: a levélben csak a cím, saját 2–3 mondat, egy kérdés és a link szerepel.
- Új adminfelület a levelek előnézetére; a heti összefoglaló bővítése (külön szelet, ha kell).

## Szeletek
- **S1 — adat és admin:**
  - migráció: `learners.interests text[]`, `learners.newsletter boolean`, alapból `{}` / `false`;
  - Drizzle-séma;
  - `PATCH /api/admin/learners/:id` (admin, CSRF);
  - a „Tanulók” fülön szerkeszthető érdeklődés + hírlevél-kapcsoló.
- **S2 — gyártás és küldés:**
  - `learner_newsletters` foglalási tábla;
  - engedélyezett forráslista (`shared/newsletter-sources.ts`);
  - cikkválasztó (GPT-6.1 Sol medium: keresés az engedélyezett domainekre szűrve → a szerver letölti és ellenőrzi →
    választás + rövid ismertető + kapcsolódó anyag a tanuló évfolyamának listájából);
  - levélsablon; cron 16:00 (+ 16:30 újrapróba); e2e-ben ki.

## Adatvédelem és biztonság
- **Modellnek átadott adat:** az érdeklődési címkék és az évfolyam. Név, e-mail-cím és tanulói azonosító soha.
- **Napló:** nincs benne név és cím, csak a foglalás azonosítója.
- **Források:** csak az engedélyezett domainekről (keresési szűrő + szerveroldali újraellenőrzés).
  - A letöltés a meglévő `safe-fetch`-csel, nyilvános https-oldalak.
- **Életkori szűrés:** a választó modell kötelező `ageAppropriate` ítéletet ad; hamis vagy hiányzó ítélet → nincs levél aznap.
  - A katonai téma technika- és történelemközpontú; napi háborús hír, naturalisztikus erőszak, politikai propaganda tilos.
- **Hibatűrés:** hiba vagy alkalmas cikk hiánya → aznap nincs hírlevél; a reggeli emlékeztetőt ez nem érinti.

## Edge case-ek
- Üres érdeklődés vagy kikapcsolt hírlevél → a tanuló kimarad.
- Ugyanaz a cikk (URL) 60 napon belül nem ismétlődik ugyanannál a tanulónál.
- A modell nem létező anyagot nevez meg → a híd elmarad, a cikk megy.
- A tanulóhoz több cím tartozik → mindegyik megkapja (a foglalás tanulónként és naponként egy generálás, címenként egy
  küldés).
- A tanuló évfolyamán nincs illeszkedő anyag → nincs híd.
- Szerver-újraindítás 16:00 körül → a foglalás miatt nincs dupla levél; a 16:30-as kör pótolja a kimaradtat.

## Elfogadás (EARS)
- **Szerkesztés:** HA az admin a „Tanulók” fülön érdeklődést és kapcsolót állít, AKKOR a `PATCH` legfeljebb 8 címkét
  (egyenként ≤ 40 karakter) ment, és a lista frissül; nem admin → 401/403.
- **Küldés:** HA 16:00 van ÉS a tanulónál `newsletter = true` ÉS van érdeklődés, AKKOR aznap legfeljebb egy hírlevél megy a
  tanuló címeire. A levél cikk-linkje engedélyezett domainre mutat, és a szerver aznap sikeresen letöltötte.
- **Hiányzó ítélet:** HA a modell nem ad `ageAppropriate: true` ítéletet, AKKOR nincs levél, és a foglalás `skipped`.
- **Modell bemenete:** HA a cikkválasztó fut, AKKOR a modell bemenetében nincs név és e-mail-cím (teszt).
- **E2E-mód:** a cron nem indul.
