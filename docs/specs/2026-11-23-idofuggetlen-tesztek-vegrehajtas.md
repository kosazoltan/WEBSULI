# Végrehajtási utasítás — időfüggetlen tesztek (KB #205, #206, #212)

Terv: `docs/specs/2026-11-23-idofuggetlen-tesztek.md`. Munkakönyvtár: a worktree `source/` mappája. Minden parancs
`env -u DATABASE_URL` előtaggal fut (a Hermes-környezet `DATABASE_URL`-je nem a repóé).

Bizonyító előtöltők (scratch, NEM kerülnek a repóba):

- `ugro-ora.mjs`: `Date.now = () => valódi + (hívásszám++) * 16 * 60_000` — óraugrás minden olvasáskor.
- `keso-idozito.mjs`: a `setTimeout(fn, 5)` 55 ms-mal fut — ütemezési csúszás terhelés alatt.
- `cpu-akadas.mjs`: az első 30 ms-os időzítő visszahívása előtt 300 ms-os CPU-akadás (GC-szünet / terhelt gép).

Futtatás: `node --import tsx --import file:///<scratch>/<előtöltő>.mjs --test --test-reporter=tap tests/<fájl>`.

## 1. RED — a javítás előtt (főág állapota)

1. `ugro-ora` + `tests/vocab-distractor-overlap.test.ts` → elvárt: `not ok … bank-szintű invariáns` („futásideje 966416 ms”).
2. `ugro-ora` + `tests/support-tamper.test.ts` → elvárt: `not ok … OAuth state „…xx” végződéssel`.
3. `ugro-ora` + `tests/admin-access.test.ts` → elvárt: 4 `not ok` (kizárás elleni őr 2, AdminStateStore 2).
4. `keso-idozito` + `tests/parallel-bank.test.ts` → elvárt: `not ok … review #265: a haladás a valóban futó egységeket követi`.
5. `cpu-akadas` + `--test-name-pattern="ÜRES szövegblokk"` + `tests/claude-stream-thinking-liveness.test.ts` → elvárt:
   `not ok … review #212: ismételt ÜRES szövegblokk` („eltelt: 373 ms”). (Az `ugro-ora` itt nem használható: a termékkód
   tétlenségi határideje maga is falióra-alapú — `server/ai/stream-collect.ts:27-47` —, az ugró óra a helyes kódot is bedönti.)

## 2. #205 — `source/tests/vocab-distractor-overlap.test.ts`

1. A fájl elejére (az importok után) segéd: `const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };`
   JSDoc-kal (miért nem falióra: #205).
2. A „bank-szintű invariáns” tesztben `const started = Date.now();` → `const started = cpuMs();`,
   `const ms = Date.now() - started;` → `const ms = Math.round(cpuMs() - started);`; a korlát (`ms < 60_000`) és az üzenet
   („CPU-idő”) marad.
3. Teszt: `node --import tsx --test tests/vocab-distractor-overlap.test.ts` → mind zöld; `ugro-ora`-val is zöld.

## 3. #206 — `source/tests/parallel-bank.test.ts`

1. Importok: `import test, { type TestContext } from "node:test";`.
2. Segédek a fájl elején:
   - `const settle = async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); };`
   - `async function onFakeClock<T>(t: TestContext, run: () => Promise<T>): Promise<T>`: `t.mock.timers.enable({ apis: ["setTimeout"] })`,
     elindítja a `run()`-t, és amíg nem rendeződik (legfeljebb 10 000 lépés): `await settle(); t.mock.timers.tick(1);`; a végén
     `await settle()` és az ígéret visszaadása (elutasítás is továbbmegy).
3. A 3., 4., 5. teszt (`async (t) =>`) a `buildLessonExperience(...)` hívást `onFakeClock(t, () => buildLessonExperience(...))`
   alakban futtatja; a `setTimeout` késleltetések (5 / 30 / 20 ms) és minden állítás változatlan.
4. Teszt: a fájl zöld; `keso-idozito`-val is zöld.

## 4. #206 / 303. megjegyzés — `source/tests/claude-stream-thinking-liveness.test.ts`

1. `mockClaude` opciói: `onFrame?: (frame: string) => void` — minden elküldött szöveges keret után hívja.
2. A „review #212: ismételt ÜRES szövegblokk” teszt: számolja az elküldött `content_block_stop` kereteket; a `t0` / `Date.now()`
   állítás helyett `assert.ok(stops < 10, …)`. Indok a kommentben (terv 4.3).
3. Teszt: a fájl zöld; `cpu-akadas`-sal (a 4. tesztre szűrve) is zöld.

## 5. #212 — `source/tests/support-tamper.test.ts`

1. Az „OAuth state …xx” teszt `(t) =>` paramétert kap; `const NOW = 1_800_000_000_000; t.mock.timers.enable({ apis: ["Date"], now: NOW });`
   a rekord `t: NOW`. A komment: befagyasztott óra (#212), az időbélyeg nem a falióra.
2. Teszt: zöld; `ugro-ora`-val is zöld.

## 6. #212 — `source/tests/admin-access.test.ts`

1. Import: `mock` a `node:test`-ből.
2. A „JM7c-1 — kizárás elleni őr” és a „JM7c-1 — AdminStateStore (login-CSRF)” `describe` blokkban
   `beforeEach(() => mock.timers.enable({ apis: ["Date"], now: NOW }))` és `afterEach(() => mock.timers.reset())`
   (`const NOW = 1_800_000_000_000`).
3. A „15 perc után lejár” teszt: új állítás a határra — `t = NOW - (15 * 60_000 - 1)` → érvényes; `t = NOW - 15 * 60_000` → lejárt.
4. Teszt: zöld; `ugro-ora`-val is zöld.

## 7. Kapuk és lezárás

1. `npm run gate:stage` (repó gyökeréből) → zöld; commit.
2. `npm run gate:push` → zöld.
3. `node scripts/qa/gates/local-review.mjs` → ítélet; `high` lelet kódból igazolva/cáfolva.
4. PR-leírás (`.scratch`-en kívül, scratch mappában) + `npm run gate:pr -- --body-file <fájl>` → zöld.
5. `git push -u origin fix/idofuggetlen-tesztek`, `gh pr create --base main`. Merge NEM.
6. A terv A1–A6 jelölői a valódi kimenet alapján `[x]`-re.
