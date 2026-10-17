# Leckekészítő stúdió — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-studio-ui.md`. Ág: `feat/studio-ui` (a #275 ágára épül). A parancsok a `source/` mappából futnak.

1. **Mérőszkript előbb** (`tests/studio-ui.spec.ts`, Playwright).
   - Környezet: `/admin?tab=lesson-studio`, mockolt API (admin felhasználó). Méretek: 360, 390, 673, 768, 1024 és 1440 px,
     világos és sötét mód.
   - Állapotok: üres; futó gyártás és kész lecke (a `single-run-follow.spec` és az `admin-draft-lessons.spec` fixture-mintái
     szerint).
   - Feltételek:
     - nincs vízszintes kilógás, nincs levágott szöveg;
     - 1024 px alatt minden látható interaktív elem legalább 44 × 44 px;
     - pixelalapú kontraszt: a szöveg színe a számított `color`; a háttér a szöveg dobozának képernyőképéből jön (a szélek
       mediánja); a határ AA;
     - kész leckénél látszik az „Arculat” sor.
   - **A teszt előbb piros**: a mai hibákat mutatja; utána jön a javítás.
2. **`client/src/components/studio/studio.css` (új), `.ws-studio` hatókör:**
   - Inter betű (a meglévő `/fonts/lesson-fonts.css`), törzsszöveg 15 px, segédszöveg legalább 13 px;
   - a tartalom `max-width: 1100px`, középen;
   - 1024 px felett az űrlap és a súgó két hasábban;
   - a letiltott elsődleges gomb tömör, halk felületet kap mért kontrasztú szöveggel (`opacity` nélkül).
   - A `LessonStudioPanel` gyökere kapja a `ws-studio` osztályt.
3. **Érintési méret:**
   - `admin.tsx`: a fülsor 1024 px alatt `min-h-11` és 13 px; a fejlécgombok `min-h-11 min-w-11`;
   - a stúdió forrásválasztó gombjai és az ikongombok szintén legalább 44 px.
   - Ami a mérés szerint valódi kontraszthiba, az mért színpárt kap.
4. **`client/src/components/studio/LessonArtSummary.tsx` (új):**
   - Bemenet: `htmlFileId`. Adat: a `lessonByFileQuery` (#275), a `resolveStoredArt` és a `DESIGN_THEMES`.
   - Megjelenítés: a sáv neve és színpöttye; a tantárgyikon; a kép bélyegképe (`/api/design-assets/<id>`, `onError` →
     katalógus); a kabala; a témakör címkéje (`TOPICS`, ha a bank ága már bent van; addig a kulcs).
   - Régi lecke esetén: „Régi lecke: az arculatot megnyitáskor választja.”
   - Elhelyezés: a `JobMonitor` kész állapotában és a `DraftLessons` publikált sorában.
5. **Tesztek:**
   - unit: `LessonArtSummary` tiszta segédfüggvénye (a tárolt arculatból a megjelenítendő sorok);
   - a meglévő stúdió e2e-k zöldek maradnak: `single-run-follow`, `admin-draft-lessons`, `studio-generation-recovery`,
     `workflow`, `web-research-completion`;
   - az 1. pont mérőtesztje zöld.
6. **Kapuk:** tsc, check:test, lint, unit, a célzott Playwright és a build.
   - A PR-ba előtte–utána képernyőképek kerülnek 390 és 1440 px-en.
