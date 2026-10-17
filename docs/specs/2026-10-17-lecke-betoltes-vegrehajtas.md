# Lecke megnyitása — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-lecke-betoltes.md`. Ág: `fix/lecke-betoltes`. A parancsok a `source/` mappából futnak.

1. **`client/src/lesson-runtime/lesson-query.ts` (új):** `lessonByFileQuery(fileId)`, a mai `LessonView` lekérdezésének
   kiemelése.
   - Kulcs: `["/api/lessons/by-file", id]`; ugyanaz az `apiRequest` (a pontozó-fejléccel), ugyanaz a retry.
   - A `LessonView` és a `Preview` is ezt használja.
2. **`client/src/pages/Preview.tsx`:**
   - A `lessonByFileQuery` az anyag-metaadattal párhuzamosan indul, ha az id ismert, és a főoldali lista-gyorsítótár nem
     mondja, hogy a típus nem „lesson”.
   - Lecke esetén a config betöltése nem tartja vissza a megjelenítést.
   - A töltőképernyő a 3. pont szerinti `LessonLoading` (a sáv az anyag `classroom` mezőjéből). Más típusnál marad a mai
     „Betöltés…”.
3. **`client/src/lesson-runtime/LessonLoading.tsx` (új):** a sáv felületén egy sávfejléc-váz és egy hős-váz, egyetlen
   „Lecke betöltése…” felirattal (`role="status"`).
   - Ismeretlen évfolyamnál semleges.
   - A `LessonView` saját töltőképernyője is ez (`classroom` paraméterrel).
4. **`shared/design-assets.ts`:** új `lessonArtIds(art: LessonArt)` → `{ subjectIcon?, picture?, mascot? }`, és új
   `resolveStoredArt(stored, band, catalog)`.
   - A `resolveStoredArt` a tárolt azonosítókból `LessonArt`-ot ad vissza; a `picture` hős vagy borító.
   - Csak a sávnak megfelelő elemet fogad el: az ikon sáv-utótagja egyezik, a kép a korosztályé, kabala csak 1–5.
     Ami nem felel meg, az kimarad. Ha a kép kimarad, a hívó a mai számolásra vált.
5. **`shared/lesson-schema.ts`:** az `art` séma bővül: `picture` és `mascot`, ugyanazzal az azonosító-mintával, `.strict()`.
6. **`server/design-assets.ts`:** a `withSubjectIcon` helyett `withLessonArt(json, seed, executor)`.
   - A katalógust a táblában létező azonosítókra szűri, és a `pickLessonArt` + `subjectIconId` eredményét
     (`lessonArtIds`) írja az `art`-ba.
   - A seed: frissítésnél a lecke azonosítója; új leckénél `<mapId>:<cím>`.
   - Hiba esetén a lecke `art` nélkül ment.
   - A `pipeline-store` `upsertLesson` és a `structured-improvement` apply ezt hívja; a régi név megszűnik.
7. **`client/src/lesson-runtime/LessonRuntime.tsx` és `LessonArt.tsx`:**
   - Ha a leckének van érvényes tárolt `art`-ja, a `resolveStoredArt` adja a képeket, egyébként a mai `lessonArtFor`.
   - A tárolt elemek forrása `/api/design-assets/<id>`. Hibánál (`onError`) egyszer a katalógus `src`-re vált.
   - A hős-kép `fetchPriority="high"`.
8. **Admin-javítópanel (tulajdonosi képernyőkép, 2026-10-17):** betöltés közben a „Lecke betöltése…” alatt azonnal megjelent
   a nyitott „Tananyag javítása” űrlap („A lecke és a gyakorlóbankok újragyártódnak…”). Ez volt a „valamit javít / újragenerál”
   látvány.
   - A `Preview` csak a lezárult betöltés után mutatja (hibás leckénél is, hogy a sérült lecke javítható maradjon).
   - A `LessonRepairPanel` `collapsed` módban egy „Tananyag javítása…” gombként indul; futó javításnál nyitva marad.
   - A Javítóműhely beágyazott nézete változatlan.
9. **Tesztek:**
   - unit: `resolveStoredArt` (sávszűrés, kabala-szabály, ismeretlen id); `lessonArtIds`; séma-elfogadás.
   - DB (`tests/design-assets-db.integration.ts`): az `upsertLesson` a teljes `art`-ot írja, csak létező azonosítókkal; a
     javítás útvonala is ezt teszi.
   - e2e (`tests/lesson-loading.spec.ts`), a javítópanel betöltés alatti hiányával együtt:
     - késleltetett API mellett egyetlen töltőképernyő, a sáv felületének színével;
     - a `by-file` kérés nem az anyag válasza után indul;
     - tárolt `art` esetén a hős az `/api/design-assets/`-ről jön;
     - 500-as válasznál katalógus-tartalék.
   - A meglévő `lesson-responsive`, `lesson-design` és `subject-icon` csomag zöld.
10. **Kapuk:** tsc, check:test, lint, unit, `test:learning-db`, a célzott Playwright, build. Merge és deploy után élő
   visszamérés ugyanazzal a felvevő szkripttel.

## Utólagos pont (élő visszamérés a #275 után, 2026-10-17)
11. **Az első képkocka sötétkék (≈ 1,1 s):** a CSS már betöltött, de a React még nem rajzolt, ezért a `body` szándékos sötétkékje
    látszik. Ez a kezdőlap dizájnja (`index.css`).
    - `client/index.html`: egy beágyazott szkript a `<head>`-ben `/preview/` útvonalon `ws-lesson-route` osztályt tesz a `<html>`-re.
      A CSP engedi: `script-src 'unsafe-inline'`.
    - `index.css`: `html.ws-lesson-route body` → `hsl(var(--background))` háttér és a hozzá tartozó előtérszín.
    - `App.tsx`: útvonal-váltáskor az osztály ki-be kapcsol, így a kezdőlapra visszalépve a sötétkék megmarad.
    - E2e (`lesson-loading.spec`): a `/preview/` első festésekor a `body` nem sötétkék; a kezdőlapra lépve újra az.
