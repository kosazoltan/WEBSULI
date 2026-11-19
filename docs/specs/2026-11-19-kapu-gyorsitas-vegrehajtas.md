# Végrehajtás: kapu-gyorsítás (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-19-kapu-gyorsitas.md` · Ág: `fix/kapu-gyorsitas` (a friss `origin/main`-ről) · Munkafa:
> `.claude/worktrees/kapu-gyorsitas`

Minden pont ELŐBB bukó teszttel; mutációs ellenpróba másolaton; commit-üzenet fájlból.

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. `scripts/qa/gates/merged-probe.mjs` (új): `selectProbeTests(files)`, `tapCounts(out)`, `mergedProbe(ctx, { head, base, files })` —
   a `pre-push-gate.mjs` `mergedGuardCheck` kódjának kiemelése, kiegészítve a PR-tesztekkel, a darabszámmal, a fa azonosítójával és
   az időtartammal. `scripts/qa/gates/merged-probe.test.mjs`: a választás és a TAP-összesítő.
3. `scripts/qa/gates/pre-push-gate.mjs`: a C-61 lépés a `mergedProbe(ctx, { head: 'HEAD', base, files: [] })`-t hívja (a régi
   függvény kikerül).
4. `scripts/qa/gates/pre-merge-gate.mjs`: `decideMainMoved({ …, probe })` — a hatókör-érintő esetekben `probeNeeded: true`; a
   próba eredménye dönt. `decideMerge` továbbadja a `probe`-ot. `main()`: `git fetch origin pull/<n>/head` + `git fetch origin main`
   (hash-egyezés a GitHub-adatokkal), `mergedProbe`, majd `decideMerge`. Tesztek: a régi „új CI kell” FAIL helyén a próba-alapú
   döntés (PASS / FAIL / nem futott → FAIL).
5. `scripts/qa/gates/carry-over.mjs` (új) + `.test.mjs` (valódi, ideiglenes git-tárban): `checkCarry` (két szülő; a régi fej az
   egyik; a másik az `origin/main` őse; a `merge-tree` fája = az új fej fája; `git patch-id --verbatim` azonos), `carryRecords`
   (csak `ok: true` régi rekord; a vak ítélet kötelező), CLI; `package.json` `gate:carry`.
6. `scripts/qa/gates/gates.config.json`: `$repoWideScopes` magyarázat (a tábla a próba kiváltója).
7. Doksi (külön commit): `docs/minosegkapuk.md` (C-61 próba, átvitel, vak-kör szabály, gép-zár szabálya), `AGENTS.md` „Minőségkapuk”
   (vak-kör szabály, 1 mondat), `.agents/skills/websuli-fejlesztesi-ellenor/SKILL.md` + `.claude` tükör (vak-kör szabály),
   `docs/agent-csapdak.md` (új bejegyzések a main utolsó C-száma után).
8. Ellenőrzés: `node --test scripts/qa/gates/merged-probe.test.mjs scripts/qa/gates/carry-over.test.mjs scripts/qa/gates/pre-merge-gate.test.mjs scripts/qa/gates/pre-push-gate.test.mjs`;
   mutációs ellenpróba; `npm run gate:stage`; gép-zárral `npm run gate:push`, és az összefésült próba futásidejének mérése
   (≤ 3 perc).

## Javítókör (vak review 1. kör: NEM) — terv: `docs/specs/2026-11-19-kapu-gyorsitas.md` 7. pont

Minden pont ELŐBB bukó teszttel (a régi kódon bukik, az újon zöld); ez a doksi-commit a kód előtt.

1. `scripts/qa/gates/merged-probe.mjs`: `probeScope({ prFiles, mainFiles })` (L2), `guardShortfall` (L4: a main az alsó korlát),
   junit riporter az őrönkénti darabszámhoz (`tapCountsByFile`), `probeEnv` (L3: engedélylista, titoknevek és `NODE_TEST_*` nélkül),
   `PROBE_TIMEOUT_MS` = 10 perc (L9), hiányzó `source/node_modules` → FAIL `npm.cmd ci` üzenettel; a `files` paraméter megszűnik
   (a hatókör a `merge-base`-ből számolódik). Teszt: `merged-probe.test.mjs` (valódi ideiglenes tár, csonk `tsx`).
2. `scripts/qa/gates/pre-merge-gate.mjs`: `probeStep` (L3: fork / ítélet / kötelező ellenőrzések előfeltétel), `mergeDecision`
   (L6: a `main()` ezt hívja), `completeFiles` (L9: lapozott REST, csonka → kivétel), `runMergeProbe` `finally` ága törli a
   `refs/remotes/origin/gate-pr-<n>` ref-et. Teszt: `pre-merge-gate.test.mjs`.
3. `scripts/qa/gates/carry-over.mjs`: `--base` megszűnik (2-es kilépés), `freshMain` (L1), a próba a teljes hatókörrel az új fejen,
   `mainSha` a `carry-` rekordban, `carryRecords` csak IGEN / IGEN, FELTÉTELLEL ítéletet visz át, `reviewedHead` + `carryChain` (L8).
   Teszt: `carry-over.test.mjs` (csupasz tár mint `origin`).
4. Doksi: `docs/minosegkapuk.md` (pontos hatókör, átvitel feltételei, vak-kör L7, „Ismert korlátok” L5 + L3), `AGENTS.md`, a
   `websuli-fejlesztesi-ellenor` skill + tükör, `docs/agent-csapdak.md` C-76 / C-78.
6. Tulajdonosi döntés „≤ 7 perc + 1 újrafuttatás” (terv 7. pont, kanban #205): `scripts/qa/gates/pre-merge-gate.mjs`
   `probeWithRetry(run, log)` — PASS → egy futás; FAIL → pontosan egy újrafuttatás, jelölve (`attempts`, `retried`, `firstNote`, a
   megjegyzésben „ÚJRAFUTTATVA (#205)”); a második bukás FAIL. A `runMergeProbe` ezt hívja, a `merge-probe-` rekord a jelölést tárolja.
   Teszt (`pre-merge-gate.test.mjs`): kétszeri bukás → FAIL; a jelölés kötelező; legfeljebb két futás; első PASS → nincs újrafuttatás.
5. Mutációs ellenpróba másolaton (a vak ellenőr 9 túlélője is); `git merge origin/main`; `npm run gate:stage`; gép-zárral
   (`kapugyorsitas`) a legrosszabb eset próba-mérése és `npm run gate:push`.

## 3. javítókör (vak review 3. kör: NEM) — terv: `docs/specs/2026-11-19-kapu-gyorsitas.md` 8. pont

1. Ez a doksi-commit, a kód előtt.
2. Tesztek ELŐBB (a régi kódon bukjanak): `pre-merge-gate.test.mjs` (L1 PR-szöveges ítélet → nincs próba; L4 main-elmozdulás a próba
   alatt → FAIL, rögzített SHA a próbának; L8 egyedi ref, takarítás hash-eltérésnél is; L9 összidő; L10 kis PR átnevezéssel),
   `check-quality-gates.test.mjs` (L4: `mainSha` nélküli / eltérő merge-bizonyíték → DENY), `carry-over.test.mjs` (L2 célfej `NEM`
   megmarad mindkét sorrendben; L3 a próba `scopeHead`-et kap; L11 `--base=`), `merged-probe.test.mjs` (L3 beolvasztott main +
   `scopeHead`; L5 bukó main-alapmérés; L6 hiányzó ellenőrző; L7 háromfázisú ellenőrző a szintetikus merge-en; L8 lassú futás tára;
   L9 lejárt keret).
3. Kód: `merged-probe.mjs`, `pre-merge-gate.mjs`, `carry-over.mjs`, `scripts/qa/hooks/check-quality-gates.mjs`.
4. Doksi: `docs/minosegkapuk.md` (L1, L4, L9 a runbookban). `gate:stage`, új fej.
