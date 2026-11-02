# Végrehajtás — kevert válaszsorrend (terv: `docs/specs/2026-11-02-valasz-keveres.md`)

Munkakönyvtár: `source/`. Sorrendben.

## T1 — `shared/option-order.ts` (új)
- `export function optionOrder(seed: string, count: number): number[]` — FNV-1a 32 bit (`Math.imul`), mulberry32, Fisher–Yates;
  `count <= 1` → `[0]` / `[]`.
- `export const refersToOtherOptions = (options: string[], feedback: string[] = []) => boolean` a spec regexével.
- `export function displayOrder(seed: string, options: string[], feedback: string[] = []): number[]` — hivatkozásnál
  identitás, különben `optionOrder`.
- `export function balancedLayouts(choices: { question; options; correctIndex; feedbackPerOption? }[]): Map<string, number[]>` — kulcs
  `choiceSeed`; célpozíció a legkevésbé használt pozíciók közül (seedelt döntetlen-bontás), a többi opció `optionOrder` szerint.
- `export const choiceSeed = (question: string, options: string[]) => [question, ...options].join("\u0000")`.

- Ellenőrzés T1-re: `node --import tsx --test tests/option-order.test.ts` → `ℹ fail 0`.

## T2 — `client/src/lesson-runtime/LessonRuntime.tsx` `CheckBlock`
- Új `ChoiceLayoutContext` (`Map<string, number[]> | null`); a lecke-gyökér `useMemo(() => balancedLayouts(összes check blokk), [lesson.sections])`-t ad.
- `CheckBlock`: `layout?.get(choiceSeed(...)) ?? displayOrder(...)`.
- `order.map((i, position) => …)`: a gomb tartalma és `data-testid` az eredeti `i`; a betű `OPTION_KEYS[position]`.

- Ellenőrzés: `npx tsc --noEmit` → kimenet nélkül, exit 0; `npm run test:e2e -- tests/option-shuffle.spec.ts` → az 1. teszt `passed`.

## T3 — `client/src/lesson-runtime/LessonExperienceView.tsx` Kvíz
- `const quizLayout = useMemo(() => balancedLayouts(quiz), [quiz])`; `(quizLayout.get(choiceSeed(q.question, q.options)) ?? displayOrder(...)).map((i, position) => …)`, betű `"ABCD"[position]`,
  minden más (`pick === i`, `picks[q.id] = i`) eredeti index.

- Ellenőrzés: `npm run test:e2e -- tests/option-shuffle.spec.ts tests/lesson-fusion.spec.ts` → minden `passed`.

## T4 — `client/src/lesson-runtime/SavedLessonQuiz.tsx`
- `displayOrder(q.id, q.options).map((pickedIndex, position) => …)`, betű `"ABCD"[position]`; a POST `pickedIndex` eredeti.

- Review #375: a szerver `viewOf` kérdésenként `fixedOrder` jelzőt küld (`refersToOtherOptions(options, feedbackPerOption)`); a kliens
  `q.fixedOrder` esetén a tárolt sorrendet mutatja.
- Ellenőrzés: `npx tsc --noEmit -p tsconfig.test.json` → exit 0; `npx playwright test --config playwright.lesson-practice.config.ts` → `8 passed`.

## T5 — tesztek
- Új `tests/option-order.test.ts`: permutáció (minden index pontosan egyszer); determinisztikus; 2/3/4 opciós eloszlás 4000 seeden
  (minden pozíció 15–35% 4 opciónál); hivatkozó opciónál identitás; az Antigoné-minta torzítását (A:54/B:30/C:12/D:2 + 6×B) a
  megjelenített pozíción egyik pozíció sem haladja meg a 40%-ot (szintetikus kérdésszövegekkel, a valós eloszlással); `balancedLayouts`: a helyes pozíciók darabszáma legfeljebb 1-gyel tér el, minden layout permutáció, a helyes opció a célpozíción.
- `tests/websuli.spec.ts`: `options.nth(1)` → `page.getByTestId('check-option-1')`, `options.nth(0)` → `page.getByTestId('check-option-0')` (dokumentált spec-változás).
- Új `tests/option-shuffle.spec.ts`: `/__lesson-runtime-probe` (VITE_ENABLE_RUNTIME_PROBE) helyett a meglévő mockolt
  e2e-minta: a probe-lecke ellenőrzőjén a DOM-sorrend = `displayOrder(...)`, a betűk A,B,C… sorban, a helyes opcióra kattintva `data-state="right"`.
- Parancsok: `npm test`, `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npx eslint client/src server --max-warnings 0`,
  `npm run test:e2e -- tests/option-shuffle.spec.ts tests/websuli.spec.ts tests/lesson-verdict.spec.ts tests/lesson-progress-persistence.spec.ts`.

- Elvárt kimenet: `npm test` → `ℹ fail 0`; `tsc` mindkét konfiggal exit 0; `eslint` → exit 0, 0 figyelmeztetés; a négy e2e fájl → `passed`, `failed` nincs.

## T6 — élő mérés
- Az Antigoné-lecke JSON-ján (`/api/lessons/by-file/7900a871…`, `x-websuli-scoring: 5`) a helyes válasz megjelenített pozíciójának eloszlása.
- Parancs: `node --import tsx <scratchpad>/shuffle-measure.mts <lecke.json>`; elvárt: opciószámonként a helyes pozíciók darabszáma legfeljebb
  1-gyel tér el (mért: ellenőrzők 2/2/1/2; kvíz 3 opciós 18/18/18, 4 opciós 11/11/11/11).
