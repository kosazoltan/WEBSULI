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
