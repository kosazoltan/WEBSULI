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
   mindegyiknél a régi (`git show b7165a56955991c9a4bdf913f0cdd8974463077e:source/tests/parallel-bank.test.ts` ideiglenes másolat) és az új teszt ugyanazokon bukik;
   visszaállítás a másolatból, utána `cmp` és `git diff --quiet -- server/studio/experience-builder.ts`.
7. Commit: `test(bank): a párhuzamos bank tesztjei vezérelt sorrenddel, falióra nélkül (#206)`.

## 3. lépés — `source/tests/vocab-distractor-overlap.test.ts` (#205)

1. A „bank-szintű invariáns …” teszt `(t) =>` paramétert kap; `Date.now()` helyett `performance.now()` (falióra: kiírás, a 7. lépés óta második korlát is — 150 000 ms) és
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
- Régi változat: `git show b7165a56955991c9a4bdf913f0cdd8974463077e:source/tests/<fájl> > source/tests/zz-old-<fájl>` (ideiglenes; a mérés után törlendő, nem commitolható).
- Ablakok (mindegyik ≤ 2 perc, régi és új EGYSZERRE, azonos terheléssel): szóbank — folyamatos 60 pörgető, 10 + 10; párhuzamos bank —
  szaggatott 22 pörgető, 10 + 10; stream-életjel — vegyes (30 folyamatos + 22 szaggatott), 10 + 10.
- Elvárt: a régi mindháromnál legalább 1/10 bukás, az új 10/10 zöld. A kimenet záró sorai a PR-leírásba.
- A végén: `rm source/tests/zz-old-*.test.ts`, `git status --short` csak a szándékolt fájlokat mutatja.

## 6. lépés — Szakasz-kapu és PR-leírás

- `npm run gate:stage` a munkafa gyökeréből → zöld; a záró sorok a jelentésbe.
- PR-leírás a munkafán kívül (az orkesztrátor megadott scratchpad-útvonalán, `body.md`), a `docs/minosegkapuk.md` szakaszaival, a
  mérésekkel (előtte / utána, terhelés alatt) és a `🤖 Generated with [Claude Code](https://claude.com/claude-code)` sorral.
- Csapda-javaslat a zárójelentésbe (C-48: szelet-PR nem ír a közös katalógusba).

## 7. lépés — A vak ellenőr leletei (NEM ítélet a `624b91fe` fejre; terv 4.1 L2, 4.2 L1, 7. pont L3)

Sorrend: előbb a leletet bizonyító mutáns (a mostani fejen ZÖLD → a lelet valós), utána a javítás, utána ugyanaz a mutáns BUKIK.

1. **L1 — `source/tests/vocab-distractor-overlap.test.ts`:** `CPU_LIMIT_MS = 60_000` és `WALL_LIMIT_MS = 150_000` konstans a teszt
   előtt (indokló megjegyzéssel); a végén a CPU-állítás mellé `assert.ok(wallMs < WALL_LIMIT_MS, …)`. Bizonyító mutáns (scratchpad
   `mut-l1.sh`): a `generateVocabQuestion` elejére 1000 hívásonként `Atomics.wait(…, 1500)`; futtatás a `source/`-ban, utána a
   forrás visszaállítása + `cmp` + `git diff --quiet`. Elvárt: a `624b91fe` fejen zöld (CPU ~15 s, falióra ~178 s), a javítás után
   bukik a falióra-állításon.
2. **L2 — `source/tests/parallel-bank.test.ts`:** segédek: `SETTLE_TURNS = 50`, `loopTurns(n)`, `gateOrTurns(gate)`. A „hiba után is
   megvárja” teszt: `firstFailed`, `releaseCall`, `saveEntered`, `releaseSave` kapuk; a külső ígéret állapota (`outerSettled`) a
   hiba után 50 kör múlva és a mentés alatt 50 kör múlva is `false`; a mentés feloldása után elutasít; a `doneAtReject === 1`
   állítás megmarad. Bizonyító mutáns (scratchpad `mut-l2.sh`): `Promise.allSettled` → gyors hibájú `Promise.all`, a hiba két
   `setImmediate`-kör után dobva. Elvárt: a `624b91fe` fejen zöld, a javítás után bukik; a korábbi három mutáns változatlanul bukik.
3. **L3 — doksik:** a régi változat forrása `git show b7165a56955991c9a4bdf913f0cdd8974463077e:<út>` (nem `HEAD`).
4. Ellenőrzés: `node --import tsx --test tests/parallel-bank.test.ts tests/vocab-distractor-overlap.test.ts` → zöld; terheléses
   ellenpróba csak gépi zárral, ≤ 2 perc; `npm run gate:stage` csak gépi zárral (az orkesztrátor írja be az `idozites` nevet).
5. Commitok: `test(bank): a mentési teszt kapukkal (vak ellenőr L2)`, `test(szobank): falióra-felső korlát a CPU-korlát mellé (vak
   ellenőr L1)`, `docs(teszt): …`.

## 8. lépés — A vak ellenőr 2. köre (IGEN, FELTÉTELLEL a `045a25bd` fejre; L1, L2 közepes, L3 kicsi)

1. Bizonyító mutánsok a `045a25bd` fejen (scratchpad `mut-l2b.sh`): türelmi 120 kör → zöld (L1 valós); a 2. indítás 5 ms-os
   időzítő mögött (érvényes, párhuzamos) → a „befejezési sorrend” teszt bukik (L2 valós).
2. `source/tests/parallel-bank.test.ts`: `useFakeTimers(t)` (`setTimeout`, `setInterval`), `untilGate(t, gate)` és `driveWindow(t)`
   (`WATCHDOG_STEPS = 1000`, `WATCHDOG_TICK_MS = 1000`); a három vezérelt teszt `(t)` paramétert kap; a `gateOrNextTurn`,
   `gateOrTurns`, `loopTurns`, `SETTLE_TURNS` kikerül. A „hiba után is megvárja” teszt: a hiba után és a mentés alatt
   `driveWindow`, utána `outerSettled === false`.
3. Elvárt (`mut-l2b.sh` + `mut-l2.sh` az új teszten): a HIBÁS mutánsok (türelmi 120 kör / 50 ms / 30 s, gyors hiba, késleltetett
   gyors hiba, soros, befejezési jelzés nélkül) bukik; a HELYES változatok (2. indítás `setImmediate` / időzítő mögött) zöldek.
4. L3 (doksi): a CPU-idő és a falióra két külön mennyiség (terv 4.2); a 3. lépés 1. pontja a 150 s-os második korlátot említi.
5. Commit: `test(bank): hamis órás őr a vezérelt bank-tesztekben (vak ellenőr 2. kör, L1–L2)` és `docs(teszt): …`; utána a zár
   alatti `gate:stage` + terheléses újramérés az új fejen.
