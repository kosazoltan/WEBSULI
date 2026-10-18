# Tanmenet-rendezés kiegészítése — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-18-tanmenet-kiegeszites.md`. Ág: `feat/tanmenet-kiegeszites`. A parancsok a `source/` mappából futnak.

1. **`server/curriculum/hints.ts` (tiszta):**
   - `hintsFromHtml(html)`: h1–h3, szkript és stílus nélkül;
   - `hintsFromLesson(json)`: fejezet- és blokkcímek, valamint a `**félkövér**` kulcsfogalmak;
   - legfeljebb 30 elem.
2. **`server/curriculum/match.ts`:**
   - `matchMaterial` opcionális `hints` bemenete; a második kör küszöbe `HINT_MIN_SCORE`;
   - csak az elsődleges tantárgyban keres; legalább két címszónál a címnek is hozzá kell járulnia;
   - évfolyam nélküli anyag: `null`.
3. **`server/curriculum/index.ts` + `load.ts`:**
   - `withCurriculum(files, load)` aszinkron; a cím alapján nem illeszthető anyagok tartalmát egyszer olvassa be;
   - memória, `clearCurriculumHints()` a lista-gyorsítótár érvénytelenítésekor (`routes.ts`).
4. **Nyelvi tanmenet:**
   - a talált iskolai tanmenet(ek) kivonata: `server/data/nyelvi-tanmenet.json`, forrással;
   - az index a NAT-tanmenettel együtt épül; a `subjectsOfTitle` „angol” / „francia” kulcsa a nyelvi tervekre illeszt;
   - szezonális címek elsőbbsége megmarad.
5. **Tesztek:**
   - unit: jelzők kinyerése; tartalom szerinti illesztés valódi tanmenettel (pozitív és a mérésben talált negatív esetek);
     `withCurriculum` hamis betöltővel (egyszeri betöltés, memória, 0. évfolyam kihagyva); nyelvi illesztés;
   - mérés a 209 éles anyagon (csak olvasás), az eredmény a PR-ba kerül.
6. **Kapuk:** tsc, check:test, lint, unit, build.
