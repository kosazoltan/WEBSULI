# Arányos helyi kapuk — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-11-23-aranyos-kapuk.md`. Ág: `fix/aranyos-kapuk`, munkafa `.claude/worktrees/aranyos-kapuk`. A PR repó-szintű kaput
érint (C-61): a #538 (szintén `pre-pr-gate.mjs`) UTÁN olvad be, előtte `git merge origin/main`.

1. `scripts/qa/gates/gates.config.json`: `smallFix` blokk (`maxProdLines: 30`, `prodPatterns`, `prodExclude`, `never`); a `dbPatterns`
   szűkítése (`source/shared/schema`, `source/migrations/`, `source/server/storage`, `source/server/db`).
2. `scripts/qa/gates/lib.mjs`: `parseNumstat(text)`, `prodLineStats(entries, smallFix)` (tiszta függvény: `{ lines, files, never, binary,
   small }`), és a `verdictResult(v, head, small)` harmadik paramétere (ítélet hiányában kis javításnál PASS).
3. `scripts/qa/gates/pre-push-gate.mjs`: a lint-blokk `fast` módban; az egységteszt-lépés a `pushUnitTests` (új, exportált, tiszta)
   döntése szerint célzott vagy teljes; a C-61 lépés kiemelése `freshMainStep`-be (a PR-kapu is hívja).
4. `scripts/qa/gates/pre-pr-gate.mjs`: a kis javítás számítása (`git diff --numstat --no-renames <base>...HEAD`) és átadása az
   ítélet-lépésnek; zöld push-bizonyítéknál a push-lépések helyett `git fetch` + `freshMainStep`; build kihagyása böngészős futás mellett.
5. `scripts/qa/gates/pre-merge-gate.mjs`: a kis javítás a `pr.files` (`additions`, `deletions`) alapján, `decideMerge` → `verdictResult`.
6. Tesztek: `lib.test.mjs` (numstat, sorszámítás, küszöb, kizárt útvonal, bináris, `verdictResult` kis javítással), `pre-push-gate.test.mjs`
   (célzott / visszaesés; a meglévő natív-kivétel teszt a teljes ágon), `pre-pr-gate.test.mjs` (nem ismétel zöld push-bizonyítéknál),
   `pre-merge-gate.test.mjs` (kis javítás ítélet nélkül PASS, 31 sor FAIL).
7. Dokumentáció: `docs/minosegkapuk.md` (kapu-táblázat és a kis javítás szabálya), `AGENTS.md` (Minőségkapuk 3. pont), a
   `websuli-fejlesztesi-ellenor` skill (`.agents` forrás → `.claude` tükör, `skills-sync-check`).
8. `npm run gate:stage` → `gate:push` → vak kör (a PR maga NEM kis javítás: `scripts/qa/`) → `gate:pr` → PR.
