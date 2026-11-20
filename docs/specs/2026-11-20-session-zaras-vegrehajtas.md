# Session-zárás — végrehajtási utasítás (MI-ügynöknek)

Terv: `docs/specs/2026-11-20-session-zaras.md` (D1–D9, E1–E14, A1–A12). Munkafa: `.claude/worktrees/session-zaras`,
ág: `feat/session-zaras-kereses-osszevetes`. Minden parancs a munkafa gyökeréből. Valódi tulajdonosi szöveg / személyes adat a
repóba (fixture, teszt, doksi) NEM kerülhet: a tesztek szintetikus átiratot építenek.

## T1 — Bukó tesztek (a kód előtt)

1. `scripts/qa/session-closeout.test.mjs` — `node:test`, szintetikus JSONL-építővel (`line({ … })`):
   - A1: `extractOwnerMessages` csak a `origin.kind: "human"` sorokat adja (kizárva: `tool_result`, `task-notification`,
     `ci-monitor-event`, `peer`, `isMeta`, `isSidechain`, `isCompactSummary`); `<system-reminder>` kivágva; kép-szám;
     beillesztett blokk; azonos `uuid` egyszer; sérült sor számlálva; régi (origin nélküli) átirat tartalék-szabálya; a
     `tool_result`-ba ágyazott, `origin: human` JSON-sor NEM tétel (E6); Codex-alak (befecskendezett üzenetek kizárva); `plain`.
   - D2/E8: `mergeMarkdown` megtartja a kitöltést, az új üzenetet a végére fűzi.
   - A2–A6: `verifyCloseout` hamis ellenőrzőkkel (`checkers`): kitöltetlen; ismeretlen állapot; KÉSZ bizonyíték nélkül; KÉSZ nem
     mainen lévő commit / nem MERGED PR / nem done kanban / hiányzó fájlsor; FOLYAMATBAN nyitott jegy nélkül; ELVETVE nem létező
     döntési tételre; altétel kitöltetlen; nyilatkozat hiánya / rossz szám / hiányzó nyitott azonosító; a lista régebbi az
     átiratnál; tétel-szöveg hash-eltérés; zöld eset.
   - Folyamat-szinten (`node scripts/qa/session-closeout.mjs collect|verify` ideiglenes git-repóban, `WEBSULI_QA_EVIDENCE_DIR`
     ideiglenes könyvtárra, hamis `gh` / kanban nélkül csak `commit` és `fájl` bizonyítékkal): collect → kitöltés → verify zöld →
     `closeout-ok-<session>.json` (A7); új tulajdonosi sor az átiratba → verify bukik (A6); `session-hygiene.mjs` bizonyíték nélkül
     exit 1, zöld után exit 0 (A8).
2. `scripts/qa/hooks/check-session-closeout.test.mjs` — folyamat-szintű hook-próbák (`execFileSync(node, [hook])`, stdin JSON):
   A9 tilt (`decision: "block"`, a reasonben a `collect` parancs és a feldolgozatlan darabszám); A10: rövid válasz, gyenge jel
   rövid válaszban, `stop_hook_active` (→ `systemMessage`, nincs `decision`), `background_tasks` nem üres, friss zöld closeout után
   (nincs új tulajdonosi sor) → nem tilt; zöld után új tulajdonosi sor → tilt; nem `Stop` esemény → semmi; git-repón kívül → semmi;
   hibás bemenet → semmi; belső hiba (olvashatatlan átirat-útvonal könyvtárként) zárásnál → tilt teendővel. Teljesítmény: ≥ 100 MB
   szintetikus átirat → < 1500 ms (A11).
3. `scripts/qa/hooks/settings-hooks.test.mjs` — `probeFor`: `check-session-closeout.mjs` → Stop-bemenet (zárásra utaló
   `last_assistant_message`, szintetikus átirat egy tulajdonosi sorral) → elvárt `block`; a `runSettingsHook` az esemény nevét és a
   próba teljes bemenetét adja; a `verdict` ismeri a `decision: "block"`-ot.
4. `scripts/qa/gates/skills-sync-check.test.mjs` — `assert.equal(names.length, 6)` és `names` tartalmazza a
   `websuli-session-zaras`-t.

Futtatás: `node --test scripts/qa/session-closeout.test.mjs scripts/qa/hooks/check-session-closeout.test.mjs
scripts/qa/gates/skills-sync-check.test.mjs` → elvárt: BUKIK (a modulok még nincsenek).

## T2 — `scripts/qa/session-closeout.mjs`

Exportok: `extractOwnerMessages(buf, { format })`, `scanOwnerSince(buf, offset)` (gyors bájtkeresés, a hook is ezt használja),
`buildItems`, `renderMarkdown`, `mergeMarkdown`, `parseFilled`, `verifyCloseout`, `makeCheckers(exec, ctx)`,
`resolveTranscript(args)`, `ownerSliceSha`. CLI: `collect` és `verify`, `--transcript <út>` | `--session <id>`,
`--format claude|codex|plain` (alapból: kiterjesztés / tartalom alapján). Bizonyíték-tár: `lib.evidenceDir(git common dir)`.
Kimenet szűrve (`lib.redact`). Ellenőrzők: git (`rev-parse --verify`, `merge-base --is-ancestor`, `cat-file -e`, `show`), gh
(`gh pr view <n> --json state`), kanban (`node $HERMES_KANBAN_CLI show <n>`, tartalék: `%LOCALAPPDATA%/hermes/skills/software-development/hermes-kanban-workflow/scripts/kanban.mjs`,
cwd: a fő munkakönyvtár). Elérhetetlen eszköz → „nem igazolható” → bukás.

## T3 — `scripts/qa/hooks/check-session-closeout.mjs`

A terv D6 / D7 szerint; a `scanOwnerSince`-t a `session-closeout.mjs`-ből importálja; a reason tartalmazza:
`node scripts/qa/session-closeout.mjs collect --transcript "<út>"`, a kitöltendő fájl útját, a `verify` parancsot és a skill nevét.

## T4 — `scripts/qa/session-hygiene.mjs`

D8 szerint: zöld, friss bizonyíték (a bizonyíték bájtmérete óta nincs tulajdonosi sor) nélkül exit 1; zöldnél leltár
(`git worktree list --porcelain`, `git branch --merged origin/main`, `git status --short` a fő munkakönyvtárban), exit 0.

## T5 — Skill, konfig, vezérlő fájlok

1. `.agents/skills/websuli-session-zaras/SKILL.md` (frontmatter `name` + `description`), majd
   `node scripts/qa/gates/skills-sync-check.mjs --fix` a `gates.config.json` `mirroredSkills` bővítése után.
2. `package.json`: `session:collect`, `session:verify`, `session:hygiene`.
3. `AGENTS.md`: új szakasz a kezelt blokkon kívül („Session-zárás: kérés-összevetés a higiénia előtt — tulajdonosi utasítás
   2026-11-20”); `.cursor/rules/websuli-core.mdc` és `.github/copilot-instructions.md`: egy-egy sor.

## T6 — Ellenőrzés

1. `node --test scripts/qa/session-closeout.test.mjs scripts/qa/hooks/check-session-closeout.test.mjs
   scripts/qa/gates/skills-sync-check.test.mjs scripts/qa/hooks/settings-hooks.test.mjs scripts/qa/hooks/hook-failure.test.mjs` → zöld.
2. `node scripts/qa/gates/skills-sync-check.mjs` → minden OK.
3. Mutációs ellenpróba (kézi, visszaállítva): (a) az `origin.kind === 'human'` feltétel elhagyása → A1 / E6 bukik; (b) a
   `stop_hook_active` ág elhagyása → A10 bukik; (c) a KÉSZ commit `is-ancestor` ellenőrzés elhagyása → A3 bukik; (d) a nyilatkozat
   nyitott-azonosító ellenőrzésének elhagyása → A5 bukik.
4. Mérés: a hook a valódi (helyi) 115 MB-os átiraton, bizonyíték nélkül: futásidő ms-ban; `collect` a valódi átiraton → csak
   darabszámok a jelentésbe.
5. NEHÉZ KÖR (`gate:stage`, `gate:push`) csak a gépi zárral (az orkesztrátor sorrendfájlja szerint).
