# A válaszkeverés utáni maradó kockázatok felszámolása

Tulajdonosi kérés 2026-11-02: „Végezd el teljességgel a frissítést, szüntesd meg a maradandó kockázatokat.”
Előzmény: PR #375 (válaszkeverés) záró jelentése három maradó kockázatot nevezett meg.

## 1. Bukó `learning-flow.browser.ts` 1–5. teszt

**Mért gyökérok** (a `main` 5b938539-en is bukott, tehát nem a #375 okozta):
- A teszt a `.lesson-cover-art` rajzos borítót várta. A `docs/specs/2026-10-17-websuli-lecke-hos.md` (review #273) dokumentált
  spec-változása óta a borító a katalógus képe (`.ws-art`), a rajzos ábra csak tartalék — a `tests/lesson-design.spec.ts:86–90` már ezt méri.
- A kvízkattintások a DOM-pozícióra támaszkodtak (a #375 óta kevert a sorrend).
- **Rendszerszintű ok:** a `playwright.learning-flow.config.ts` és a `playwright.lesson-practice.config.ts` nem futott a CI-ben,
  ezért egyik spec-változás sem jelzett.

**Döntés:**
- A borító-ellenőrzés a `lesson-design.spec.ts` mintáját követi (a cím megvárása után `.ws-art > img`, különben `.lesson-cover-art`).
- A kvízkattintás a kör `balancedLayouts` elrendezéséből számolt helyes pozícióra kattint (szándék változatlan: 2 helyes → 2 pont).
- A két konfig bekerül a `.github/workflows/ci.yml` E2E jobjába (a már ott futó `html-persistence` / `lesson-arbiter` mellé; Chrome
  csatorna, ahogy a `html-persistence` is).

**Elfogadás:** `npx playwright test --config playwright.learning-flow.config.ts` → 23 passed (10 learning-flow + 13 lesson-fusion);
`npx playwright test --config playwright.lesson-practice.config.ts` → 8 passed; a PR CI-jében mindkét új lépés zöld.

## 2. Témához nem illő borító (Antigoné: „Digitális tudáslabor” + függőhíd)

**Mért tény:** nem hiba, hanem a `spec 2026-10-19-hos-kep-sav` tulajdonosi döntése (`shared/design-assets.ts` `pickLessonArt`): ha
nincs címre ÉS tantárgyra illő, azonos sávú kulcsszavas borító, a sáv saját koncepcióképe jelenik meg (9–10.: függőhíd); a sáv neve
„Digitális tudáslabor”. A katalógusban nincs a 9–10. sávhoz irodalmi / drámai borító.

**Döntés:** a megoldás új, jóváhagyott katalógus-borító (képgenerálás + a tulajdonos képválogatója) vagy a sávszabály módosítása —
mindkettő tulajdonosi döntés és költség; kód nem változik e nélkül. NOT DONE ebben a szeletben, ok: jóváhagyás szükséges.

## 3. Címismétlés az Antigoné-lecke első bekezdésében

„A Szophoklész: Antigoné című drámát Szophoklész írta” — a cím („Szerző: Mű”) a szerző nevét is tartalmazza.

**Döntés:** a `docs/lesson-improvement.md` előírt útja a célzott javítás az admin Stúdióban (forrásellenőrzés, lektor, tranzakciós
mentés, visszaolvasás). Közvetlen DB-írás ezt megkerülné. A javítás admin-belépést igényel (az ágens jelszót nem ad meg).
NOT DONE ebben a szeletben, ok: admin-munkamenet szükséges.

## Nem-cél
- A gyártási prompt módosítása a „Szerző: Mű” címek miatt (élő méréssel külön feladat lenne).
