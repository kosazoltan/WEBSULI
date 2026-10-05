# Illusztráció szám-attribútum — végrehajtás (AI-olvasható)

Spec: `docs/specs/2026-10-05-illusztracio-szam-attributum.md`. Munkakönyvtár: `source/`.

## 1. Regressziós teszt (előbb, bukjon)

Fájl: `source/tests/illustration-svg.test.ts` — új `test(...)` blokkok a fájl végére:
- `<rect x="265" y="+" …>` → `r.ok`, `r.svg` nem tartalmaz `y="+"`-t, `r.attrFixes` = `['rect.y="+"']`.
- érvényes értékek (`dy="10%"`, text `x="10 20"`, `y="-1.5e2"`, `font-size="large"`, `offset="50%"`, `rx="auto"`) → `attrFixes` üres, az értékek megmaradnak.
- `rect x="10 20"` → elhagyva.
- idempotencia: a kimenet újratisztítása ugyanazt adja, `attrFixes` üres.
- `visualParamProblems("illustration", { svg })` → van `érvénytelen szám` probléma.

Parancs: `npm.cmd test -- --test-name-pattern="szám-attribútum"` → elvárt: a javítás előtt BUKIK.
(A `test` script glob-ot ad át; ha a minta-szűrés nem megy át, `node --import tsx --test tests/illustration-svg.test.ts`.)

## 2. Tisztító

Fájl: `source/shared/illustration-svg.ts`
- `IllustrationCheck` ok-ágába: `attrFixes: string[]`.
- Új konstansok: `LENGTH`, `LENGTH_LIST` regex, `NUMERIC_ATTRS` táblázat (spec „Rögzített döntések”).
- Új függvény `dropInvalidNumbers(root, elements): string[]` — minden elemre és attribútumra a táblázat szerint; hibásnál `removeAttribute` + `${tag}.${attr}="${value}"`.
- Hívás a viewBox-ellenőrzés után, a `problems` visszaadás előtt (a gyökér width/height törlése előtt nem gond: azokat is ellenőrzi, de utána úgyis törlődnek — a gyökér width/height-et kihagyjuk a jelentésből).

## 3. Kapu

Fájl: `source/shared/lesson-visual-params.ts`, `visualParamProblems` illusztráció ága:
ok esetén `[...attrFixes problémaként, ...illustrationLayoutProblems]`, szöveg: `érvénytelen szám-attribútum (a böngésző nem rajzolja): …`.

## 4. Ellenőrzés

- `node --import tsx --test tests/illustration-svg.test.ts tests/svg-contrast.test.ts` → mind PASS.
- `npm.cmd run check` → 0 hiba.
- `npm.cmd test` → teljes suite PASS.
- Böngésző: helyi kliens (vite) az éles API-val vagy a lecke JSON-jával; a Mezopotámia-lecke 1. fejezete; `read_console_messages` → nincs `Expected length`.
