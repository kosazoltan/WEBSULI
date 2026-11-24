# Végrehajtási utasítás — pontozó: „nem tudom”, ékezetes rövid szó, kérdés-visszamásolás (T-2)

**Állapot:** kész – 2026-11-23, ág `fix/pontozo-polinom-ket-szam`
Terv: `docs/specs/2026-11-23-pontozo-rubrika-visszamasolas.md`

Útvonalak a `source/` alatt. Tesztet gyengíteni tilos; a meglévő korpuszesetek nem módosulnak. Lookbehind tilos. Minden új eset
szintetikus (valós tanulói adat nem kerül a korpuszba).

## V1 — bukó tesztek ELŐBB

- `tests/fixtures/scorer-corpus.json` `cases` (v1 + `ee_evaluate`): a terv „Edge case-ek” táblájának sorai pozitív és negatív párban,
  `source: "#130/#132 (T-2, szintetikus)"`. A kérdés-másolat esetekhez a `task.q` mező (a korpusz alapja ma `q: "q"`).
- `tests/scorer-corpus.test.ts`: a `Case` típus `task` mezője `q`-t is felvehet. A korpusz `typedCases` tömbjébe egy típusos (v2) pár:
  kérdés-másolat (a v2 út is 0), és „nem tudom” a típusos feladatra (0).
- Parancs: `node --import tsx --test tests/scorer-corpus.test.ts` → az új esetek buknak (v1, `ee_evaluate`, v2).

## V2 — megosztott pontozó (`shared/lesson-experience-score.ts`)

- `NON_ANSWER` reguláris kifejezés (lookbehind nélkül: `(^|[^\p{L}])…(?=$|[^\p{L}])`), `stripNonAnswer(text)`.
- Ékezetmegtartó normalizálók (`normalizeAnswerRaw`, `normalizeAnswerV2Raw` — belső, a meglévő exportok szignatúrája marad).
- `RubricTokens = { tokens, raw }`: `raw` csak akkor nem null, ha a válaszban van ékezet (`\p{M}` NFD után) és a két tokenlista hossza
  egyezik. `conceptHit` rövid (< 5 betűs) szónál a folded találat mellett a közös tő ékezetét is összeveti (`accentAgrees`).
- `copiesQuestionOnly(answer, q)`; a v1 és a v2 elején (a nem-válasz törlése után) → `{ state: "fail", score: 0, reason:
  QUESTION_COPY_REASON }`.
- `OPEN_ANSWER_RULES_HU`: NEM változik (bájtra őrzött, promptverzió-emelés nélkül — a terv „Nem-cél” része).

## V3 — HTML-referencia (`server/ai/lesson-html-spec.ts`, `ee_evaluate`)

- `ee_stripNonAnswer`, `ee_normRaw`, `ee_accentAgrees`, `ee_copiesQuestion` — ES5 (nincs `let`/nyílfüggvény/lookbehind), a v1-gyel azonos
  szabály; az `ee_wordHit` / `ee_phraseHit` / `ee_conceptHit` egy opcionális ékezetes tokenlistát kap.

## V4 — ellenőrzés

- `node --import tsx --test tests/scorer-corpus.test.ts tests/scoring-v2.test.ts tests/polynomial-answer.test.ts tests/open-answer-short.test.ts tests/lesson-html-score.test.ts tests/lesson-html-spec.test.ts tests/score-english-negation.test.ts tests/score-word-forms.test.ts tests/no-lookbehind-client.test.ts tests/single-choice-check.test.ts tests/bank-repair.test.ts` → `fail 0`.
- Mutációs ellenpróba (mindegyik után visszaállítás, zöld): M5 `stripNonAnswer` → identitás; M6 `accentAgrees` → mindig igaz; M7
  `copiesQuestionOnly` → mindig hamis; M8 az `ee_evaluate` másolat-szabálya kikapcsolva. Mindegyikre bukik legalább egy korpuszeset.
- Kapuk: `npm run gate:stage` → `npm run gate:push` → `node scripts/qa/gates/local-review.mjs` → `npm run gate:pr -- --body-file …`.
