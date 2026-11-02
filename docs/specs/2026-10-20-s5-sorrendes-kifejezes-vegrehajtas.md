# S5 — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-s5-sorrendes-kifejezes.md`. Munkakönyvtár: `source/`.

Két PR:
- **PR1:** S5a — ág `feat/s5-sorrendes-kifejezes`.
- **PR2:** S5b — a PR1 összevonása után, a main-ről.

## PR1 — S5a: pontozó + séma + szerződés
1. **`shared/lesson-experience.ts`:** `openTaskSchema` + `requiredPhrases: z.array(z.array(text(80)).min(1)).min(1).max(8).optional()`.
   - A `scoringVersionFor` a kifejezéses feladatnál `PHRASE_SCORING_VERSION`-t ad.
2. **`shared/answer-value.ts`:** `PHRASE_SCORING_VERSION = 4`, `LESSON_SCORING_VERSION = 4`.
   - Ellenőrizd a kliens és a szerver verziókezelését (`X-Websuli-Scoring`), hogy a 4-es lecke a régi klienst frissítésre kérje.
3. **`shared/lesson-experience-score.ts`:**
   - `isTypedTask` + `requiredPhrases`;
   - új `phraseHit(tokens, alternatives)`: az alternatíva `tokensOfV2` tokenjei a válasz `tokensOfV2` tokenjeiben egymás után,
     pontos egyezéssel;
   - `evaluateOpenAnswerV2`: `hits` / `total` = `required` + `requiredPhrases`. Az indoklás a hiányzó kifejezésnél: „a helyes
     alak / szórend hiányzik”.
   - `missingPhrases(answer, task)` (diagnosztika);
   - `OPEN_ANSWER_RULES_HU` új szabály (7.): a kifejezés pontos, egymás utáni, a csoporton belül VAGY.
   - A `answerTokensCover` / J1 a kifejezést nem nézi — azt az `answer-key-tests` kezeli (4. pont).
4. **`shared/answer-key-tests.ts` `blockingWrongCases`:** a J1-kivétel csak akkor, ha a hibás próba a teljes pontos helyes válasz
   minden szavát tartalmazza ÉS a kifejezéscsoportokat is teljesíti (`missingPhrases` üres). Ugyanígy az `answerKeyNotes`.
5. **`server/arbiter/arbiter.ts` `arbiterCacheKey`:** kifejezés esetén `requiredPhrases` is a kulcsba (kifejezés nélkül a kulcs
   bitre azonos). **`shared/lesson-result-email.ts` `rubricHash`:** ugyanígy.
6. **Bank:**
   - `server/studio/bank-schema.ts` strict séma: `requiredPhrases` nullable + `OPTIONAL_ARRAY_KEYS`;
   - `server/studio/bank-repair.ts` `TASK_RUBRIC` + `requiredPhrases`;
   - `server/studio/lektor-view.ts` megjeleníti;
   - `server/studio/experience-builder.ts` mezőleírás + szabály;
   - `server/studio/role-skills.ts`: a bank és a lektor szabálya — nyelvtani / idegen nyelvi alak- és szórend-feladatnál
     `requiredPhrases`;
   - `server/studio/support-skills.ts` ellenőrző szabály.
7. **HTML-út:** `server/improve/align-html-bank.ts` — a kifejezéses feladatot kihagyja (a HTML-pontozó nem ismeri).
8. **Teszt (`tests/s5-sorrendes-kifejezes.test.ts`):**
   - „There is a sofa” ok, „There are a sofa” nem ok;
   - „mustn t” aposztróffal és anélkül;
   - pontos (a „feeds” ≠ „feed”);
   - kifejezés nélkül v1 bitre azonos (korpusz zöld);
   - a `scoringVersionFor` 4;
   - J1: a szórend-csere kifejezéssel blokkol;
   - a döntőbíró-kulcs kifejezés nélkül változatlan;
   - a strict séma elfogadja.
9. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
   - Böngészős próba: a kliens pontozó a megosztott kódot használja — e2e (Playwright) tesztet keress a lecke-felületre; ha van
     kifejezéses fixture-re alkalmas, futtasd.

### PR1 megvalósítási pontosítások
- **`isComputedTask`:** új ismérv a számolós vagy kvótás feladatra (`typedAnswers` / `requiredDistinct`). A válaszkulcs-tesztek, a
  tesztíró, a minta-igazítás és a kalibráció csak ezt hagyja ki. A kifejezéses feladat a v2 úton pontoz, de szöveges rubrika:
  tesztelt és kalibrált. A szóalapú kalibráció ezért már a PR1-ben fut rajta.
- **A skill-szövegek nem bővültek:** a bank (< 5200) és a bank-ellenőrző (≤ 2800) hosszkorlátja miatt. A modell a szabályt a
  pontozó szerződéséből (`OPEN_ANSWER_RULES_HU` 7.) és a bank mezőleírásából kapja. A lektornézet mutatja a kifejezést, a lektor
  ebből ítél.
- **Diagnosztika:** a válaszkulcs-teszt üzenete a hiányzó kifejezést is megnevezi. A túl megengedő rubrikánál a javítás iránya
  `requiredPhrases`, ha a különbség a nyelvtani alak vagy a szórend.
- **Kulcsok:** a döntőbíró-kulcs és a `rubricHash` csak kifejezés esetén bővül (feltételes), így a meglévő kulcsok bitre azonosak.

## PR2 — S5b: gépi szigorítás kifejezéssel
1. **`shared/answer-key-calibrate.ts` `tighten`:** szóalapú jelölt nélkül a minta 3- és 2-tokenes, egymás utáni kifejezései
   (`tokensOfV2`), a leghosszabbal kezdve, legalább egy nem kötőszó tokennel.
   - Feltétel: minden teljes pontos helyesben `phraseHit`, a hibásban nem; utána a minta / a helyesek ok, a hibás nem.
   - Felvétel `requiredPhrases`-be, jelölés `tightenedPhrases`.
   - A kalibráció a csak kifejezés miatt típusos feladatra is fusson: a kilépés csak `typedAnswers` / `requiredDistinct` esetén.
2. **S4:**
   - `relaxTask` a `tightenedPhrases` csoportot is hatástalanítja (a többi kötelező csoport tagjai alternatívák);
   - `tightenedOnlyMiss` és a telemetria (`rubricTightened`) számolja;
   - `retainTightened` megfelelője a kifejezésekre.
3. **Teszt:** a „There are a sofa” / „There is a sofa” eset szóalapon nem, kifejezéssel szigorodik; a lazítás pontot nem csökkent.

### PR2 megvalósítási pontosítások
- **Csak idegen nyelvi leckén:** `calibrateRubric(t, cases, { phrases: Boolean(language) })` (experience-builder). A magyar szórend
  szabad, ott a kifejezéses szigorítás nem fut.
- **Tagadás nem lehet a kifejezés része, minden támogatott nyelven** (review #342):
  - magyar, angol;
  - német: nicht, kein…, nie;
  - francia: ne/n', pas, non, jamais, rien, aucun;
  - spanyol: no, nunca, nada, ninguno;
  - olasz: non, mai, niente, nessuno;
  - az összevonás maradéka („t”, „n”) is tagadásjel.
- **Sémahatár (review #342):**
  - a kifejezés legfeljebb 80 karakter;
  - a `requiredPhrases` legfeljebb 8 csoport — ha betelt, nincs kifejezéses szigorítás (a javítókör dönt).
- **Commit-sorrend:** a háromfázisú CI-kapu szerint a végrehajtási utasítás az első kódcommit előtt. Az első PR (#342) ezt megsértette
  (az utasítás-kiegészítés a kód után jött volna); új ágon, helyes sorrendben ismételve.
