# Végrehajtás: falióra-független egységtesztek terhelt gépen (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-19-idozitesfuggo-tesztek.md` · Ág: `fix/idozitesfuggo-tesztek` · Munkafa:
> `.claude/worktrees/idozites-tesztek` · Kanban: #205, #206
> **Állapot:** megvalósítva helyben; push / PR / CI és a nehéz kapuk (`gate:push`, `gate:pr`) az orkesztrátoré.

Szabályok erre a szeletre: CSAK a három tesztfájl (`source/tests/parallel-bank.test.ts`, `source/tests/vocab-distractor-overlap.test.ts`,
`source/tests/claude-stream-thinking-liveness.test.ts`) és ez a két doksi változik; termékkód nem. Állítást, küszöböt gyengíteni, tesztet
kihagyni tilos. Push, PR, rebase, `--no-verify` tilos. Terheléses próba ablakonként legfeljebb 2 perc, csak célzott tesztfájlokkal;
nehéz kapu (gate:push, gate:pr, teljes `npm test`, e2e) nem fut.

## 1. lépés — Doksik (első commit)

- Fájlok: `docs/specs/2026-11-19-idozitesfuggo-tesztek.md`, `docs/specs/2026-11-19-idozitesfuggo-tesztek-vegrehajtas.md`.
- Commit (üzenet fájlból, `git commit -F`): `docs(teszt): az időzítésfüggő egységtesztek terve és végrehajtási utasítása (#205, #206)`.

## 2. lépés — `source/tests/parallel-bank.test.ts` (#206)

1. A fájl elején (a spec-hivatkozó megjegyzés után) segédek:
   - `deferred()` → `{ promise: Promise<void>, resolve }`;
   - `nextLoopTurn()` → `new Promise<void>((r) => setImmediate(r))`;
   - `gateOrNextTurn(gate)` → `Promise.race([gate, nextLoopTurn()])` — a tartalék csak hibás viselkedésnél old fel (terv 4.1).
2. „a banképítő haladása a párhuzamosan készülő egységeket adja”: `setTimeout(r, 5)` helyett `started` számláló; a 2. hívás
   indulásakor `bothStarted.resolve()`; a hívás `await gateOrNextTurn(bothStarted.promise)`. Az állítások változatlanok.
3. „review #265: a haladás a valóban futó egységeket követi”: `setTimeout(r, sectionIndex === 0 ? 30 : 5)` helyett
   `firstRound = [deferred(), deferred()]`; az első körben (`!rebuild`) a 2. hívás indulásakor `firstRound[1].resolve()`, a hívás
   `await gateOrNextTurn(firstRound[sectionIndex].promise)`; az `onProgress` a `done === 1` jelzésnél `firstRound[0].resolve()`. Az
   újraépítő (harmadik) hívás nem vár. Az állítások változatlanok.
4. „review #265: az egyik egység hibája után is megvárja a többit”: `setTimeout(r, 20)` helyett `firstFailed = deferred()`; a 0.
   egység a dobás előtt `firstFailed.resolve()`; az 1. egység `await firstFailed.promise` + `await nextLoopTurn()`. Az állítás
   (`doneAtReject === 1`) változatlan.
5. Ellenőrzés: `cd source && node --import tsx --test tests/parallel-bank.test.ts` → elvárt `ℹ pass 5`, `ℹ fail 0`.
6. Mutációs próba (terv 4.1): `server/studio/experience-builder.ts` másolata a scratchpadba; egyenként (a) `const concurrency = 1;`,
   (b) `Promise.allSettled(` → gyors hibájú `Promise.all`-burok, (c) `finished++; if (active.size) report();` → `finished++;`;
   mindegyiknél a régi (`git show HEAD:source/tests/parallel-bank.test.ts` ideiglenes másolat) és az új teszt ugyanazokon bukik;
   visszaállítás a másolatból, utána `cmp` és `git diff --quiet -- server/studio/experience-builder.ts`.
7. Commit: `test(bank): a párhuzamos bank tesztjei vezérelt sorrenddel, falióra nélkül (#206)`.

## 3. lépés — `source/tests/vocab-distractor-overlap.test.ts` (#205)

1. A „bank-szintű invariáns …” teszt `(t) =>` paramétert kap; `Date.now()` helyett `performance.now()` (falióra, csak kiírásra) és
   `process.cpuUsage()` (mérce).
2. A végén: `cpuMs = round((user + system) / 1000)`, `t.diagnostic("a bank-szintű invariáns: CPU <cpuMs> ms, falióra <wallMs> ms")`,
   `assert.ok(cpuMs < 60_000, …)` — a korlát értéke változatlan; a megjegyzés a terv 4.2 indoklására hivatkozik.
3. Ellenőrzés: `cd source && node --import tsx --test tests/vocab-distractor-overlap.test.ts` → `ℹ pass 7`, `ℹ fail 0`, és a
   kimenetben `ℹ a bank-szintű invariáns: CPU … ms, falióra … ms`.
4. Commit: `test(szobank): a bank-szintű invariáns korlátja CPU-időre épül, falióra helyett (#205)`.

## 4. lépés — `source/tests/claude-stream-thinking-liveness.test.ts`

1. `mockClaude` után: `FAKE_STEP_MS = 5`, `FAKE_LIMIT_MS = 5_000`, `onFakeClock(t, run)`: `t.mock.timers.enable({ apis:
   ["setTimeout", "Date"], now: 0 })`; a `run()` eredményét / hibáját rögzíti; ciklusban két `setImmediate`-kör, kész → `{ value,
   error, elapsedMs: Date.now() }`; különben `assert.ok(elapsed < FAKE_LIMIT_MS)` és `t.mock.timers.tick(FAKE_STEP_MS)`.
2. „A1+A3” és „A3”: a hívás `onFakeClock`-on át; `assert.equal(error, undefined)`, `assert.ok(res && elapsedMs > 80)`, a tartalmi
   állítások változatlanok.
3. „review #212 üres szövegblokk”: `onFakeClock`; `error instanceof AIProviderIdleTimeoutError`; `elapsedMs < 250` (hamis ms).
4. Ellenőrzés: `cd source && node --import tsx --test tests/claude-stream-thinking-liveness.test.ts` → `ℹ pass 8`, `ℹ fail 0`.
5. Mutációs próba (terv 4.3): `server/ai/stream-collect.ts` másolata; (a) `if (ev.text || ev.activity) deadline` → `if (ev.text)
   deadline`, (b) → `if (true) deadline`; régi és új ugyanazokon bukik; visszaállítás + `cmp` + `git diff --quiet`.
6. Commit: `test(ai): a stream-életjel tesztjei hamis órán futnak (terheléstől független)`.

## 5. lépés — Terheléses ellenpróba (helyben, nem commitolt eszközzel)

- Próbaszkript a session scratchpadjában (`loadrun.mjs`): `--busy N --seconds S [--burst 40:10 --prio above] <fájl>=<db> …`; a
  pörgetők maguktól leállnak, a határidő után még futó saját tesztfolyamatot a saját PID-je alapján állítja le.
- Régi változat: `git show HEAD:source/tests/<fájl> > source/tests/zz-old-<fájl>` (ideiglenes; a mérés után törlendő, nem commitolható).
- Ablakok (mindegyik ≤ 2 perc, régi és új EGYSZERRE, azonos terheléssel): szóbank — folyamatos 60 pörgető, 10 + 10; párhuzamos bank —
  szaggatott 22 pörgető, 10 + 10; stream-életjel — vegyes (30 folyamatos + 22 szaggatott), 10 + 10.
- Elvárt: a régi mindháromnál legalább 1/10 bukás, az új 10/10 zöld. A kimenet záró sorai a PR-leírásba.
- A végén: `rm source/tests/zz-old-*.test.ts`, `git status --short` csak a szándékolt fájlokat mutatja.

## 6. lépés — Szakasz-kapu és PR-leírás

- `npm run gate:stage` a munkafa gyökeréből → zöld; a záró sorok a jelentésbe.
- PR-leírás a munkafán kívül (az orkesztrátor megadott scratchpad-útvonalán, `body.md`), a `docs/minosegkapuk.md` szakaszaival, a
  mérésekkel (előtte / utána, terhelés alatt) és a `🤖 Generated with [Claude Code](https://claude.com/claude-code)` sorral.
- Csapda-javaslat a zárójelentésbe (C-48: szelet-PR nem ír a közös katalógusba).
