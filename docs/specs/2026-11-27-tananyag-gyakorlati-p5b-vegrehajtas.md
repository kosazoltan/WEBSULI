# Végrehajtás — TG-P5b (TANANYAG-GYAKORLATI, PR 5 második része: Stúdió-lecke bankja és a HTML-javítás auditja)

Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` — „PR 5 — A külön játékkvíz és a HTML-javítás lezárása” (130. sor).
Feladat (SQL): `TANANYAG-GYAKORLATI`. Előzmény: TG-P5a (`feat/tananyag-gyakorlati-p5a`, játékkvíz-generátor).

Hiány:
- Kanonikus (fúziós, közzétett) Stúdió-leckéhez a játékok a lecke saját, ellenőrzött bankját olvassák (`canonicalLessonQuiz`,
  `gameQuizBankService`) — a `generate-quiz` admin-művelet mégis modellt hív és párhuzamos bankot ír, amelyet egyetlen játék sem
  használ (költség, félrevezető „10 tétel mentve”).
- A HTML-javítás záró kapuja (`verifyLessonMethodHtml`) a beágyazott JSON-bankban nem nézi a feladatlapra / pontozásra kérdező
  tételt — a Stúdió végkapujával (TG-P4c) ellentétben itt meta-tétel kimehet.

1. Bukó tesztek (`tests/game-quiz-practice-p5b.test.ts`):
   - `generateMaterialQuiz` kanonikus bankkal rendelkező anyagra: nincs futás, nincs modellhívás, nincs írás; a válasz
     `canonical: { lessonId, items }`; érvénytelen kanonikus banknál (`[]`) sincs generálás, hanem hibaüzenet (a Stúdióban
     javítandó — az érvénytelen fúziós bank nem élesztheti fel a régi exportot).
   - `verifyLessonMethodHtml`: a JSON-bankba csempészett meta-kvíztétel („Hány pontot ér a feladatlapon a 3. feladat?”) és
     meta-nyílt feladat probléma, tételazonosítóval; a fixture-bank (meta nélkül) változatlanul `ok`.
2. Javítás:
   - `server/gameQuizGeneratorService.ts`: `deps.canonicalQuiz` (alapból a legfrissebb közzétett, az anyaghoz kötött lecke
     `canonicalLessonQuiz`-a) — a munkafolyamat ELŐTT; `QuizGenerationResult.canonical`. `FileCard.tsx`: tájékoztató toast.
   - `server/improve/verify-lesson-method.ts`: `practiceMetaProblems(data.experience)` (ugyanaz a mérce, mint a Stúdió
     bankkapuja). Az arány itt nem megállító (a P4c szerint a végkapun csak a meta állít meg).
3. Ellenőrzés: új + érintett egységtesztek (improve-align-html-bank, lesson-fusion-repair, lesson-html-spec, web-bank-repair,
   s7-review-203), tsc, eslint.

3b. Mért: RED 3 bukás (2× a modellhívás felé futott — API-kulcs hiba, 1× a meta-tétel nem jelzett); utána
   `game-quiz-practice-p5b` 3/0, a 15 érintett improve / fusion / html / web-research tesztfájl 115/0; tsc, eslint OK.

Állapot: kész — következő: kapulánc a TG-P5a beolvadása után.
