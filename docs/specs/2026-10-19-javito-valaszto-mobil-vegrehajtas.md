# Tananyagjavító választó — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-javito-valaszto-mobil.md`. Munkakönyvtár: `source/`. Ág: `fix/javitas-mobil-valaszto`.

1. **`client/src/lib/lesson-repair-search.ts` (új, tiszta függvények):**
   - `isRepairable(contentType)`: `lesson`, `html`, `text/html`, illetve hiányzó típus (= `html`) → igaz; a `pdf` → hamis.
   - `matchesRepairQuery(file, query)`:
     - normalizálás: kisbetű, NFD, ékezet le;
     - szavakra bontás (szóköz és írásjelek);
     - az „osztályos” / „osztálynak” stb. → „osztaly”;
     - a számszó illik, ha `classroom` egyenlő vele, vagy a cím önálló számként tartalmazza;
     - a többi szó illik, ha a cím, a „N. osztaly” jelölés vagy egy szinonimája tartalmazza.
2. **`client/src/components/LessonRepairWorkbench.tsx`:**
   - A lista szűrője az `isRepairable`, a keresés a `matchesRepairQuery`; legfeljebb 100 sor.
   - A sorban „Lecke” / „Régi HTML” jelvény és az évfolyam.
   - Sorrend: választó-kártya, 2. lépés (`id="lesson-repair-step2"`, választás után `scrollIntoView`), a tudás-kártya a végén.
   - A `LessonRepairPanel` `isLesson={current.contentType === "lesson"}`.
3. **`client/src/components/LessonRepairPanel.tsx`:**
   - Az „Alkalmazás” tiltása: `busy || (isLesson ? !repair : !candidate.data?.content)`.
4. **Mérőoldal:** `client/src/pages/RepairWorkbenchProbe.tsx` és az `App.tsx` `/__repair-workbench-probe` útvonala, csak
   `VITE_ENABLE_RUNTIME_PROBE=1` mellett.
5. **Tesztek:**
   - `tests/lesson-repair-search.test.ts` (node:test): a „4 osztályos angol” keresés találatai, ékezet, szinonima,
     évfolyam-eltérés, PDF kizárva.
   - `tests/lesson-repair-workbench.spec.ts` és `playwright.repair-workbench.config.ts`:
     - 390 és 1440 px;
     - a „4 osztályos angol” keresés a régi HTML-anyagot listázza, a kattintás után a 2. lépés látszik;
     - nincs kilógás;
     - a kész HTML-jelöltnél az „Alkalmazás” az apply-t hívja.
6. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`;
   - a node-teszt és az új Playwright-konfig;
   - `test`, `build`.
