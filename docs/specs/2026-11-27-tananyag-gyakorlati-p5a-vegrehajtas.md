# Végrehajtás — TG-P5a (TANANYAG-GYAKORLATI, PR 5 első része: a külön játékkvíz-generátor)

Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` — „PR 5 — A külön játékkvíz és a HTML-javítás lezárása” (130. sor).
Feladat (SQL): `TANANYAG-GYAKORLATI`. Előzmény: TG-P1 (#625, `practice-policy`), TG-P2a (#630, `source-teaching-scope`),
TG-P3 (#626, `practice-rules`), TG-P4a–c (#629, #631, #633).

Hiány: a `POST /api/admin/materials/:id/generate-quiz` (`generateMaterialQuiz`) a HTML-ből címkék törlésével az első
14 000 karaktert küldi a modellnek — a fejléc, a menü és az „összesen 10 pont” jellegű pontozási előszó a kivonat elején marad,
a tényleges példa pedig lecsúszhat a keretről. A validátor a meta-kérdést (pontozás, feladattípus) nem szűri, ok nélkül
számolja az eldobottat, és már egyetlen érvényes tétel is leváltja a teljes aktív készletet. Párhuzamos kérés ugyanarra az
anyagra egymás közben írhat; a visszaolvasás csak darabszámot ellenőriz.

1. Bukó tesztek (`tests/game-quiz-practice.test.ts`, `tests/single-choice-wiring.test.ts`):
   - `validateGeneratedQuizItems`: vegyes bemenet két meta-kérdéssel („Hány pontot ér a 3. feladat?”, „Melyik feladattípus
     szerepel a feladatlapon?”) és egy szóláskiegészítéssel — csak a harmadik marad; minden eldobott tételhez tételes ok
     (`rejected`: `#<sorszám>: <ok>`).
   - `teachableQuizSource(html)`: hosszú pontozási / fejléc-előszó után álló tényleges példa a kivonatba kerül; a script,
     style, nav, header, footer kimarad; a pontozási / időkeret-sor kiesik, a vegyes sor („Elfogadható: Budapest — 1 pont”)
     tanítható része marad; a keret a fejezetek között oszlik el (a késői fejezet is kap helyet); csak fejlécből / pontozásból
     álló anyagnál `null` (a modellhívás előtt megáll).
   - `collectQuizBank(count, ask)`: hiányos első válasznál legfeljebb EGY célzott pótlás (a hiányzó darabszámra, az elutasítási
     okokkal); 3, 10, 20 kért darabnál pontos darabszám, nulla meta; 10 kért / 1 átment (pótlás után is hiányos) → `complete:
     false`, és ekkor a szolgáltatás NEM deaktivál (a régi készlet olvasható marad).
2. Javítás:
   - `server/gameQuizSource.ts` (új, tiszta): DOM-szerű kivonat a tanítható szövegre, fejezetenként elosztott karakterkeret,
     soronkénti admin-szűrés a TG-P2a szabályával (`adminLineProblem`, `shared/source-teaching-scope.ts`).
   - `server/gameQuizValidation.ts`: meta-szűrés `classifyQuizItem`-mel (`kind === "meta"`), tételes `rejected` okok;
     `collectQuizBank` (első kérés + legfeljebb egy pótlás, prompt-alapú duplikátumszűrés).
   - `server/gameQuizGeneratorService.ts`: a kivonatoló bekötése (elégtelen tanítható tartalomnál hiba a modellhívás előtt),
     a `SYSTEM_PROMPT` gyakorlatias szabálya (konkrét példára épülő tétel; a pontozás, a feladattípus neve, a lap felépítése és a
     játék kezelése nem kérdezhető), csere csak teljes darabszámú bankkal; a tranzakcióban anyagonkénti
     `pg_advisory_xact_lock`, visszaolvasáskor a tényleges kérdés + kulcs egyezése. A gyakorlati arányt a válasz méri
     (`practice`: alkalmazás / fogalmi darab) — megállító arány-kapu nincs (a P4b tapasztalata: kemény arány-kapu megállította a
     gyártást), a négyopciós, négy témakörű szerződés változatlan.
3. Ellenőrzés: az új / érintett egységtesztek, tsc, lint; a kanonikus Stúdió-lecke saját bankjának átvétele és a
   `verifyLessonMethodHtml` auditja a TG-P5b-ben.

3b. Mért: `game-quiz-practice` 8/0, az érintett egységtesztek (single-choice-wiring, audit-2026-09-static — a deaktiválás-őr
   most a teljes bankra szigorítva —, s7-*, prompt-cache, cross-family-fallback-b3, source-visuals-flag) zöldek; tsc, eslint OK.

Állapot: kész — következő: kapulánc, merge (csak gyártásmentes állapotban).
