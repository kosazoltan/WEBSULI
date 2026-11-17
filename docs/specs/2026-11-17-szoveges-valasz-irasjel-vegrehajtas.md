# Végrehajtási utasítás — szöveges válasz: írásjel-, szóköz- és tipográfia-tűrés

**Állapot:** kész, PR előtt – 2026-11-17, ág `fix/szoveges-valasz-irasjel`
Terv: `docs/specs/2026-11-17-szoveges-valasz-irasjel.md`

Útvonalak a `source/` alatt. Tesztet gyengíteni tilos; a meglévő pontozó- és paritástesztek nem módosulnak.

## T1 — közös összehasonlító

Új fájl: `shared/text-answer.ts` (import nélkül; kliens és szerver is futtatja; lookbehind nélkül — régebbi Safari).

- `export function normalizeTextAnswer(value: string): string` — a terv „A helyes viselkedés” 1–5. pontja ebben a sorrendben:
  NFC → szóköz-egységesítés (` `, ` `, ` `, ` `, tab, sortörés → szóköz; `trim`; többszörös → egy) →
  aposztróf / idézőjel / kötőjel egységesítése → `toLocaleLowerCase("hu")` → a VÉGÉRŐL `[.!?…]` és szóköz ismételten →
  a teljes választ közrefogó `"…"` vagy `'…'` pár lehagyása (csak ha mindkét szélen ugyanaz a jel) → újra a záró írásjel → `trim`.
- `export function textAnswerMatches(given: string, accepted: string | readonly string[]): boolean` — minden elfogadott alakra:
  - `g = normalizeTextAnswer(given)`, `k = normalizeTextAnswer(key)`;
  - ha `k` üres (a kulcs csak írásjel): a nyers, szóköztelenített, NFC alak pontos egyezése dönt, és a nyers válasz nem üres;
  - ha `g` üres → hamis;
  - ha `k` szám alakú (`/^[+-]?\d+(?:[.,]\d+)?$/`): `g`-nek is szám alakúnak kell lennie; összevetés a `,`→`.` csere és a vezető
    `+` elhagyása után, szövegként („3,50” ≠ „3,5” — a kért alak számít);
  - különben `g === k`.
- Teszt: `tests/text-answer.test.ts` — a terv „Edge case-ek” listájának minden sora, pozitív és negatív; több elfogadott válasz;
  NFD bemenet („o” + kombináló ékezet = „ó”); nem törő szóköz; csak írásjel; üres.
- Parancs: `node --import tsx --test tests/text-answer.test.ts`.

## T2 — kitöltős blokk

`client/src/lesson-runtime/blocks/try-blocks.tsx:136-139`: az `isCorrect` feltétel
`answers.every((a, i) => textAnswerMatches(values[i] ?? "", a))` (import: `@shared/text-answer`). A mentett állapot alakja
(`TrySnapshot`) nem változik.

## T3 — kért köztes lépés mondatvégi írásjellel

`shared/answer-value.ts`, `gradeTypedAnswers`, `intermediate-step` ág: a VÁLASZ oldalán a `normalizeExpressionText` előtt a
szóköz vagy szövegvég előtti mondatvégi írásjel (`[.!?…]+(?=\s|$)`) pontosvesszőre cserélődik (helyi segédfüggvény; szóközre
nem lehet, mert a `normalizeExpressionText` a szóközt törli, és a következő szám összeolvadna a lépéssel). A referencia oldala
és a `containsExpressionState` változatlan (a „12.5” és a „120” továbbra sem egyezik).
Teszt: `tests/scoring-v2.test.ts` ÚJ esetei (meglévő eset nem módosul): „35 + 64 − 12.” / „35+64-12!” → helyes;
„35 + 64 − 12.5”, „35 + 64 − 120” → hibás; „3 · 7. 21.” két részeredménnyel → 2 / 2.
Parancs: `node --import tsx --test tests/scoring-v2.test.ts tests/lesson-html-score.test.ts tests/scorer-corpus.test.ts`.

## T4 — böngészős próba (valódi, helyi lecke)

`tests/lesson-progress-persistence.spec.ts` mintájára (ugyanaz a config / ál-API) ÚJ spec: `tests/fill-blank-punctuation.spec.ts`
— a `fillBlank` blokkba a kulcs pont nélkül, ponttal, nagybetűvel és szóközzel → „Helyes!”; ékezethibával → hibás visszajelzés.
Előtte E2E-sorompó (külön lépés): `docker ps --filter name=websuli-e2e- --format "{{.Names}} {{.RunningFor}}"`; `--workers=1`.

## T5 — kapuk

Szakaszonként `npm run gate:stage`; a végén `npm run gate:push`. Push / PR nincs: a fej-hash jelentése után a független ellenőr
következik (az orkesztrátor indítja).

## Kész-feltétel

A terv `<!-- acceptance-checklist -->` listájának minden pontja futtatott parancs kimenetével igazolva.
