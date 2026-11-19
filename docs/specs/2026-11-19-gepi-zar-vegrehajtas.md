# Végrehajtás: gépi zár (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-19-gepi-zar.md` · Ág: `feat/gepi-zar` (a friss `origin/main`-ről) · Munkafa: `.claude/worktrees/gep-zar`

Szabályok: előbb a bukó teszt, utána a kód; mutációs ellenpróba commit után, másolaton (C-70: visszaállítás után `cmp`); commit-üzenet
fájlból; nehéz kaput (`gate:push`, `gate:pr`, teljes `npm test`) ez a munka NEM futtat — azt az orkesztrátor ütemezi.

1. **Ez a doksi-commit** (terv + végrehajtás), a kód előtt.
2. **Tesztek** — `scripts/qa/machine-lock.test.mjs` (`node:test`, valódi `node` gyerekfolyamatokkal, ideiglenes zár-mappával
   (`WEBSULI_MACHINE_LOCK_DIR`), `CI` törölve a gyerek környezetéből, rövid lekérdezési idővel `WEBSULI_MACHINE_LOCK_POLL_MS=50`):
   - FIFO: A fut (zár); B, majd C belép; A vége után B, majd C fut — a futási napló sorrendje A, B, C; C nem előz;
   - egyszerre egy futás: két párhuzamos `run` gyereke időben nem fedi egymást (a napló kezdés / vég jelei);
   - kilépési kód továbbadása (pl. 7), és utána a zár szabad, a sor üres;
   - időtúllépés: `--timeout-min` törtértékkel (pl. 0.02) egy hosszan futó gyerekre → 124, a gyerek leállt, a zár szabad;
   - jel: SIGTERM a futó `run`-nak (POSIX) / a Windows-on a `run` kemény leállítása helyett a jelkezelő függvény közvetlen hívása — a
     zár szabad, a gyerek leállt; várakozó `run` leállítása után a sorbejegyzése eltűnik;
   - elavult zár halott PID-del (kézzel írt `lock/owner.json` egy biztosan nem élő PID-del, ugyanazon a gépen) → a `run` visszaveszi, a
     `events.log` naplózza;
   - élő gazda zárát nem veszi el (`owner.json` a tesztfolyamat saját PID-jével, friss kezdéssel) → `--max-wait-min` lejártával 75, a
     zár érintetlen;
   - lejárt időkorlát + türelmi idő → visszavehető (élő PID mellett is), és a PID-hez tartozó folyamat él tovább;
   - CI-mód: `CI=true` mellett a zár-mappában nem keletkezik zár, a kilépési kód átjön; `CI=false` nem CI-mód;
   - újrabelépés: a gyerek a kapott `WEBSULI_MACHINE_LOCK_HELD`-del azonnal fut; hamis tokennel nem (tiszta függvény: `decideReentry`);
   - UTC: a gazda-fájl és a sorbejegyzés időbélyegei `Z` végűek;
   - `status` és `status --json`: gazda + sor;
   - a zár helye: `resolveLockDir` — változó elsőbbsége, egyébként `<common>/websuli-machine-lock`;
   - CLI-hibák: hiányzó `--name` / üres parancs → 2;
   - `isCiEnv`, `isStaleOwner` (tiszta függvények, határértékek).
   Futtatás: `node --test scripts/qa/machine-lock.test.mjs` → elvárt: bukik (nincs még `machine-lock.mjs`). Commit.
3. **Kód** — `scripts/qa/machine-lock.mjs` a terv D1–D12 szerint; exportok: `resolveLockDir`, `isCiEnv`, `isStaleOwner`,
   `isStaleEntry`, `decideReentry`, `readStatus`, `formatStatus`, `run`, `relaunchUnderMachineLock`. Futtatás:
   `node --test scripts/qa/machine-lock.test.mjs` → elvárt: minden zöld. Commit.
4. **Bekötés** — gyökér `package.json`: `test`, `test:e2e`, `verify`, `gate:push` burkoló (`node scripts/qa/machine-lock.mjs run
   --name <név> --timeout-min <D14> -- <eredeti parancs>`), új `test:learning-db` és `machine-lock`; a 16–17. sor (`gate:pr`,
   `gate:merge`) változatlan. `scripts/qa/gates/pre-pr-gate.mjs` utolsó sora: `if (isMain(import.meta.url) &&
   !relaunchUnderMachineLock({ name: 'gate-pr', timeoutMin: 300 })) main();` (a relaunch szinkron eldönti, hogy újraindít-e; ha igen,
   a szülő a gyerek kódjával kilép). `.github/workflows/ci.yml`: a QA-tesztlistába a `scripts/qa/machine-lock.test.mjs`.
   `scripts/qa/gates/gates.config.json`: `mirroredSkills` + `websuli-gep-zar`. Futtatás: `node --test scripts/qa/machine-lock.test.mjs
   scripts/qa/gates/pre-pr-gate.test.mjs`. Commit.
5. **Szabály, skill** — `AGENTS.md` új szakasz a „Minőségkapuk” után + 7. pont + skill-lista; `.agents/skills/websuli-gep-zar/SKILL.md`
   (frontmatter: `name`, `description` — „MINDEN nehéz kör előtt automatikusan töltsd be”), tükör: `node
   scripts/qa/gates/skills-sync-check.mjs --fix`, majd ellenőrzés `--fix` nélkül (elvárt: minden `OK`); `.cursor/rules/gep-zar.mdc`;
   `.github/copilot-instructions.md` egy sor. Commit.
6. **Runbook, csapdák** — `docs/minosegkapuk.md` új alfejezet a „Push-fegyelem” után; `docs/agent-csapdak.md`: index-alfejezet a
   „Tesztelés, e2e, mérés” elé, a részletek a `## C-75` elé (C-80…C-85). Commit.
7. **Ellenőrzés** — mutációs ellenpróba (a `machine-lock.mjs` másolatán, mutánsonként `node --test`, utána `cmp` az eredetivel);
   `npm run gate:stage`; `git merge-tree --write-tree feat/gepi-zar fix/kapu-gyorsitas` (kilépési kód 0); PR-leírás a munkafán kívül
   (`docs/minosegkapuk.md` szakaszai szerint).
