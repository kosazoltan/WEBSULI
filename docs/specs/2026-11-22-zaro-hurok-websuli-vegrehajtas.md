# Végrehajtási utasítás: Záró hurok — WEBSULI-változat

> Terv: `docs/specs/2026-11-22-zaro-hurok-websuli.md` (a döntések D1–D13, az elfogadás E1–E17 ott).
> Ág: `feat/zaro-hurok-websuli` (alap: `fix/memoria-index-jegyzetek`, `ef757c11`). Munkafa: `.claude/worktrees/zaro-hurok`.
> Állapot: KÉSZ (a push / PR / merge és a végleges C-NN sorszám az orkesztrátoré)

## Szabályok a végrehajtónak

- Csak a terv 3. fejezetében felsorolt fájlokhoz nyúlj. A `.hermes.md` markeres blokkja érintetlen.
- Más repó anyaga tilos (az `agentic-qa-kit`-et se olvasd). Fizetős szolgáltatás semmilyen formában nem hívható.
- Escape-et / regexet tartalmazó kódot csak Write / Edit eszközzel írj (C-75 3–4. szabály). Szövegolvasásnál `\r\n` → `\n` (C-92).
- Tesztet gyengíteni tilos; a `skills-sync-check.test.mjs` 5 → 6 darabszám a terv dokumentált spec-változása (új tükrözött skill).
- Push, PR, merge, rebase, `gate:push`, `gate:blind-review` TILOS (az orkesztrátoré).
- Csapda-bejegyzés csak ideiglenes `C-ZH-N` sorszámmal (D2).

## Lépések

1. **Commit 1 (ez a fájl + a terv):** `docs(specs): záró hurok WEBSULI-változat — terv és végrehajtási utasítás`.
2. **Bukó tesztek:** `scripts/qa/zaro-hurok.test.mjs` — ideiglenes git-tár segéddel (`git init -b main`, commit
   `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`-tel a since előtt / után). Esetek: terv 7. fejezet. Futtatás: `node --test scripts/qa/zaro-hurok.test.mjs`
   → piros (a modul még nincs).
3. **Kapu-szkript:** `scripts/qa/zaro-hurok.mjs`, exportált tiszta függvények (`parseArgs`, `validateYamlSubset`, `findMarkers`,
   `runCheck`, `planHygiene`, `applyHygiene`, `writeNoNewMarkers`), injektálható `exec` / `now` / `probeVector`. A tükör-ellenőrzés a
   `./gates/skills-sync-check.mjs` `checkSkills`-ét importálja. Alparancsok: `check`, `hygiene [--apply]`, `nincs-uj --kind …`, `konvergencia` (D14; exportált `decideConvergence`,
   `roundFromEvidence`, `roundFromReport`, `collectRounds`; a bizonyíték-mappa a `gates/lib.mjs` `evidenceDir`-jéből).
   Futtatás: a teszt zöld.
4. **Bekötés:** gyökér `package.json` → `"zaro:check"`; `.github/workflows/ci.yml` 29. sor listája + `scripts/qa/zaro-hurok.test.mjs`;
   `gates.config.json` `mirroredSkills` + `websuli-zaro-hurok`; `skills-sync-check.test.mjs` 5 → 6 (a teszt neve is).
   (PR-bontásban a `mirroredSkills` és a darabszám a skillel együtt a `feat/zaro-hurok-3`-ba kerül — a tükör-ellenőrzés különben bukna.)
5. **Skill (a feat/zaro-hurok-3-ban, tervezett):** `.agents/skills/websuli-zaro-hurok/SKILL.md` (frontmatter `name` + `description`), tükör a `node scripts/qa/gates/skills-sync-check.mjs --fix`-szel.
6. **AGENTS.md:** új „Záró hurok (kötelező, tulajdonosi utasítás 2026-11-22)” szakasz a „Minőségkapuk” után, a kezelt blokkon kívül.
7. **Memória-rétegek:** a `memory/manifest.yaml`, `memory/index.qmd`, `memory/.cogni/*.cogni.yaml` kitöltése a terv D3 szerint, csak
   igazolt tényekkel (forrás-fájl megjelölve), TODO, titok és e-mail-cím nélkül.
8. **Csapdakatalógus:** a fejlécben az ideiglenes sorszám szabálya (D2); egy `C-ZH-1` bejegyzés (a főágra közvetlenül került
   indexeletlen memóriafájl tanulsága) és egy `C-ZH-2` „Nem konvergáló vak körök” bejegyzés, skill-hivatkozással.
8b. **Skill:** „Ismétlődő hibaosztály” lépés (E19).
9. **Ellenőrzés:** `node --test scripts/qa/zaro-hurok.test.mjs scripts/qa/gates/*.test.mjs`; `cd source && npx.cmd tsx --test
   tests/memory-index-guard.test.ts tests/no-real-emails-guard.test.ts`; `npm run gate:stage` (munkafa gyökeréből) — mind zöld.
10. **Próbafutás:** `npm run zaro:check -- --since 2026-11-22T00:00:00+01:00 --json`; a kimenet a záró jelentésbe; a terv
    állapotnaplója bővül.
11. Atomi commitok (üzenet fájlból, a scratchpadből), a végén `git status --porcelain` üres.

## Kész, ha

- A terv E1–E19 pontjai teljesülnek, és a 9. lépés parancsai zölden futottak (valódi kimenettel).
