# Végrehajtás: pontozó szóalak-tűrés (terv: `docs/specs/2026-11-03-pontozo-szoalak.md`)

Munkakönyvtár: `source/`. Ág: `fix/pontozo-szoalak`.

## T1: `shared/lesson-experience-score.ts`

- Új konstansok:
  - `PRIVATIVE_SUFFIX = /^(t?[ae]l[ae]n|[ae]?tl[ae]n|l[ae]n|mentes)/` (normalizált, ékezet nélküli alakon);
  - `HU_WEAK_NEGATIONS` = `sem, se, soha, sosem, semmi, semmit, senki, senkit, sehol, nincs, nincsen, nincsenek, tilos, ne`.
- `wordHit(token, word)`: a régi ágak után, ugyanazokkal a kizárásokkal (szám, `NEGATIONS`), új függvény `formHit`. A
  `bases = {word, stem(word)}` közül a ≥ 5 betűsekre:
  - `token.startsWith(b) && token.length > b.length && !PRIVATIVE_SUFFIX.test(token.slice(b.length))`;
  - `[token, stem(token)]` bármelyike `b`-re végződik, és az előtag ≥ 3 betű;
  - végül `distance(stem(token), stem(word)) <= tol`, ha mindkét tő ≥ 5 betű.
- `unexpectedNegation`: az 1. ágban a minta „tagadó”, ha `negationKind(sample, { weak: true }) !== "none"`, VAGY a nyers szavai
  (`rawWords`) között van `HU_WEAK_NEGATIONS`-elem.
- `OPEN_ANSWER_RULES_HU`:
  - 2. pont kiegészül: „≥ 5 betűs szónál a képzett / többszörösen ragozott alak (a szóval kezdődő hosszabb szó) és az összetett szó
    utótagja is talál, a fosztóképzős (-talan/-telen/-tlan/-tlen, -mentes) alak nem”;
  - 4. pont: a minta magyar tagadószavai.

## T2: `server/ai/lesson-html-spec.ts`

- Az `ee_wordHit` ugyanezt kapja (`ee_formHit`), a régi ágak után. Új `ee_privative` regex, azonos a TS-ével.
- A tagadásőr sora (`unexpectedNegation`) kiegészül a magyar gyenge tagadószókkal (`ee_huWeakNeg(task.sample)`).

## T3: tesztek

- **Új `tests/score-word-forms.test.ts`, `evaluateOpenAnswer`-rel.**
  - Pozitív esetek:
    - `lelkiismeret` ← „lelkiismeretével”, de ↛ „lelkiismeretlen”;
    - `makacs` ← „makacsságában”, „makacskodjon”;
    - `ellenáll` ← „ellenállása”;
    - `megkövezés` ← „megkövezéssel”;
    - `kötél` ← „kötéllel”;
    - `barlangba` ← „sziklabarlangba”;
    - `nemzedék` ← „nemzedékről”.
  - Negatív esetek:
    - `boldog` ↛ „boldogtalan”;
    - `jogos` ↛ „jogtalan”;
    - `lapos` ↛ „alapos”;
    - `alap` ↛ „kalap” (4 betű);
    - `442` ↛ „4420”;
    - `sír` ↛ „sírás”.
  - Tagadás:
    - minta „Tilos eltemetni…”, válasz „Nem szabad eltemetni…” → 1 pont;
    - minta tagadás nélkül, válasz „nem” → 0,5 (változatlan).
- **`tests/lesson-html-score.test.ts`:** egy új teszteset ugyanezekre a párokra; `ee_evaluate` = `evaluateOpenAnswer`.
- **Ellenőrzés:**
  - `node --import tsx --test tests/score-word-forms.test.ts tests/lesson-html-score.test.ts` → `ℹ fail 0`;
  - `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`;
  - `npx eslint client/src server --max-warnings 0`;
  - `npm test`.

## T4: mérés (a PR leírásába)

- A végleges kóddal a vak készletek (tervezési a/b, független c/d, hibás x/y) a v1 és a v2 bankon, előtte és utána
  (`.harness/live/blind-score.local.mts`-mintára).
- Elfogadás: a helyes válaszok átlaga nő; a hibásaké ≤ +2 százalékpont.

## T5: PR → CI → merge → deploy

- Docs-commit, utána fix-commit. Háromfázisú ellenőrzés, `.audit-ok` sentinel külön hívásban. A `main` védett: a 4 kötelező ellenőrzés
  után az automatikus merge olvasztja be. Ezután a Render-revízió ellenőrzése (`/api/health`).
