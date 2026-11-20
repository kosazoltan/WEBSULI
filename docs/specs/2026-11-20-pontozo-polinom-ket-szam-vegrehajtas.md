# Végrehajtási utasítás — pontozó: polinom pontsorral, két szám műveleti jel után

**Állapot:** megvalósítás alatt – 2026-11-20, ág `fix/pontozo-polinom-ket-szam`
Terv: `docs/specs/2026-11-20-pontozo-polinom-ket-szam.md`
Szülő: `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md`, „T-1” blokk.

Útvonalak a `source/` alatt. Tesztet gyengíteni tilos; a meglévő korpusz- és pontozótesztek nem módosulnak. Lookbehind tilos
(`tests/no-lookbehind-client.test.ts`). Valós tanulói adat nem kerül a korpuszba — minden új eset szintetikus.

## V1 — bukó tesztek ELŐBB

- `tests/fixtures/scorer-corpus.json`: új felső szintű `typedCases` tömb (a meglévő `cases` érintetlen, mert azt a v1 és az
  `ee_evaluate` is pontozza, amely típusos mezőt nem ismer). Esetalak: `{ name, source, task: { required, minWords, needsSentence,
  sample, typedAnswers }, answer, expected }`. Esetek (a terv „Edge case-ek” táblája): polinom 10x + „…”, „..”, „...”, „ …”, „.”,
  „Az eredmény 10x…” → 1; „10x + 1…”, „11x..” → 0; 2.5x + „2.5x”, „2.5x..” → 1; „30 · 7 210” (lépés + 210) → 1; „30 · 7 211” → 0;
  „35 + 64 − 12 000” és „35 + 64 − 12 345” egy lépésre → 0; „35 + 64 − 12 000” lépés + 0 → 0; „12 000 : 4 3000” → 1;
  „12 000” egy számra → 1.
- `tests/scorer-corpus.test.ts`: új teszt „pontozó-korpusz — típusos (v2)”: a `typedCases` legalább 15 eset; minden eset mintája
  1 pont, a válasz pontja az elvárt (`evaluateOpenAnswer`, a típusos mező a v2 útra viszi).
- Parancs: `node --import tsx --test tests/scorer-corpus.test.ts` → az új teszt bukik (a #121 / #122 esetei), a régi kettő zöld.

## V2 — polinomjelölt-határ (`shared/polynomial.ts`, `polynomialCandidates`)

- A határjelölő második `replace`-ében a `\.(?=\s|$)` helyett `[.…]+(?=\s|$)`, hosszmegtartó cserével (callback:
  `"\n".repeat(m.length)`); a többi határjel változatlan.

## V3 — két szám műveleti jel után (`shared/answer-value.ts`, `gradeTypedAnswers`)

- Új konstans: `OPERAND_GROUP = /([\d)]\s*[OPS]\s*)(\d{1,3})[^\S\r\n\t](?=[1-9]\d{2}(?!\d|[.,]\d|[^\S\r\n\t]\d))/g` (az `OPS`
  az `arithmetic-expression.ts`-ből). `splitOperandGroups(s)` → `{ text, starts }`: a szóköz helyére `\n` (hosszmegtartó), `starts`
  a leválasztott 3 jegy kezdőpozíciói.
- A mai törzs `gradeReading(answer, answers)` belső függvénybe kerül, amely a számos részeredmények talált atomjainak kezdőpozícióit
  is visszaadja (`numberHits`).
- `gradeTypedAnswers`: első olvasat a mai; ha nem teljes és van leválasztás, második olvasat a leválasztott szövegen; ez akkor
  nyer, ha `correct` nagyobb ÉS minden `starts` elem benne van a `numberHits`-ben. A visszatérési alak (`TypedGrade`) változatlan.

## V4 — ellenőrzés

- `node --import tsx --test tests/scorer-corpus.test.ts tests/scoring-v2.test.ts tests/polynomial-answer.test.ts tests/single-choice-check.test.ts tests/no-lookbehind-client.test.ts` → `fail 0`
  (a ténylegesen létező fájlnevekkel; amelyik nincs, NOT RUN).
- Mutációs ellenpróba: V2 visszavonása → a korpusz típusos tesztje bukik (#121 esetek); V3-ban a második olvasat kikapcsolása → bukik
  („30 · 7 210”); a `starts`-feltétel kikapcsolása → bukik („35 + 64 − 12 345”, „30 · 7 211”); a 0-val kezdődő csoport kizárásának kikapcsolása
  → bukik („35 + 64 − 12 000” lépés + 0). Mindhárom után visszaállítás, zöld.
- Nehéz kör (gépi zárral): `npm.cmd run gate:stage`, `npm.cmd test` → `fail 0`; a `fill-blank-punctuation.spec.ts` a gate:pr
  böngészős körében.
