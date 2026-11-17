# Végrehajtás: Minőségkapuk (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-17-minosegkapuk.md` · Ág: `chore/minosegkapuk` · Munkafa: `.claude/worktrees/minosegkapuk`
> **Állapot:** megvalósítva (PR megnyitva; merge a tulajdonosé / az orkesztrátoré)

Szabályok erre a szeletre: a `source/` alatti alkalmazáskód nem módosul; minden szkript Node ESM, függőség nélkül; regexet csak
Edit / Write eszközzel írj, és olvasd vissza; tesztet gyengíteni tilos; titok / e-mail-cím sehova (a tesztekben a szintetikus címet
futásidőben, darabokból kell összerakni, hogy a `no-real-emails-guard` ne lássa); mutációs ellenpróba előtt commit (C-70).

## 1. lépés — Doksik (első commit)

- Fájlok: `docs/specs/2026-11-17-minosegkapuk.md`, `docs/specs/2026-11-17-minosegkapuk-vegrehajtas.md`.
- Parancs: `node scripts/qa/three-phase-check.mjs --base origin/main` → elvárt: `[három-fázis] OK: Nincs kódváltozás …`.
- Commit: `docs(qa): minőségkapuk terve és végrehajtási utasítása`.

## 2. lépés — Közös könyvtár: `scripts/qa/gates/lib.mjs` + `gates.config.json`

- Exportok:
  - `redact(text)`: e-mail-alak → `<email>`, `postgres(ql)?://…` → `<db-url>`, `ghp_ / gho_ / ghs_ / github_pat_ / sk-ant- / sk-` +
    ≥ 16 karakter → `<token>`, `Bearer <x>` → `Bearer <token>`, `AKIA…` → `<aws-key>`.
  - `createGate(name, { exec, log, now, strict })` → `{ step(name, fn), add(name, status, note), finish() }`; a `fn` `{status, note}`-ot ad;
    kivétel → `FAIL` a kivétel első sorával. `finish()` kiírja a táblát (`Lépés | Állapot | Idő | Megjegyzés`), és a kilépési kódot adja:
    1, ha van `FAIL` (vagy `strict` és `NOT RUN`).
  - `realExec(cmd, args, { cwd, env, timeoutMs })` → `{ code, stdout, stderr, ms }`; Windows-on `npm` / `npx` → `npm.cmd` / `npx.cmd`
    `shell: true`-val (csak rögzített argumentumok, szóközös argumentum idézve), minden más shell nélkül.
  - `npmRun(script)` → `['npm', ['run', script]]` a `source/`-ban (a gyökér `package.json` is továbbad, de a `source/` közvetlenül gyorsabb).
  - Git: `gitTop`, `gitHead`, `gitCommonDir` (abszolút), `mergeBase(base)`, `changedFiles({ base, includeWorkingTree })` (commitolt diff a
    merge-base óta + nem stage-elt + stage-elt + nem követett, a törölt fájlok nélkül), `untrackedFiles()`, `addedLines(base)` →
    `[{ file, line, text }]` a `git diff -U0 <merge-base>` kimenetéből (munkafával együtt).
  - Bizonyíték: `evidenceDir()` (`WEBSULI_QA_EVIDENCE_DIR` vagy `<common-dir>/websuli-qa-evidence`), `writeEvidence(name, obj)`,
    `readEvidence(name)`, `writeLog(gate, step, text)` (szűrve).
  - `tail(text, n)`; `loadConfig()` a `gates.config.json`-ból.
- `gates.config.json`: `sharedFiles` (`docs/agent-csapdak.md`, `AGENTS.md`, `.claude/settings.json`, `.github/workflows/ci.yml`,
  `source/package.json`, `source/package-lock.json`), `sliceSharedPatterns` (`source/client/src/game-engine/`, `source/shared/`,
  `source/server/routes.ts`, `source/client/src/index.css`), `games` (azonosító → kulcsszó-regex), `mirroredSkills` (az öt új skill),
  `mergeEvidenceMaxMinutes: 15`, `rtStatusUrl: "https://websuli.vip/api/rt/status"`, `auditSentinel: ".audit-ok"`, `auditMaxAgeMinutes: 10`.
- Teszt: `scripts/qa/gates/lib.test.mjs` — `node --test scripts/qa/gates/lib.test.mjs` → minden PASS.

## 3. lépés — `lint-gate.mjs`

- Export: `scanAddedLines(lines)` → leletek (`{ file, line, rule, level }`, érték nélkül):
  - tesztfájlban (`*.test.*`, `*.spec.*`) `\b(it|test|describe)\.(only|skip)\(` vagy `\.only\(` → `FAIL` „tesztet kihagyni / szűkíteni tilos”;
  - szkriptben (`scripts/**`, `source/scripts/**`, `*.sh`, `*.ps1`, `package.json`, `.github/**`; tesztfájl és `.md` nem) `git … --no-verify`
    → `FAIL`;
  - minden fájlban: privát kulcs blokk, `AKIA[0-9A-Z]{16}`, token-előtagok, jelszavas nem-loopback `postgres://user:pass@host` → `FAIL`.
- Export: `runLintGate({ mode, exec, gate, base })`. Lépések sorrendben:
  1. `git diff --check <merge-base>` (`FAIL`, ha nem üres).
  2. Nem követett fájlok → `WARN` (az e-mail-őr csak a követett fájlokat látja: `git add`).
  3. ESLint a változott `source/(client/src|server)/**.{ts,tsx,js,jsx}` fájlokra: `node source/node_modules/eslint/bin/eslint.js
     --max-warnings 0 <fájlok>` a `source/`-ban; nincs ilyen fájl → `SKIP`.
  4. (`--full`) `npm run lint`.
  5. `npm run check` — `--fast`-ban csak, ha változott `source/**.ts(x)`; különben `SKIP`.
  6. `npm run check:test` — `--fast`-ban csak, ha változott `source/tests/**` vagy `source/**.ts(x)` és a mért idő belefér (D12).
  7. Repó-szabályok a diffre: a `scripts/qa/repo-rules.json` `Edit|Write` szabályai a hozzáadott sorokra, ÉS fájlonként az
     `enforce-repo-rules.mjs` hook futtatása egy `Write` bemenettel (a fájl hozzáadott sorai) — a hook titok / kulcs / skip-only
     figyelmeztetése `FAIL`, az `eval` / néma `catch` `WARN`.
  8. `scanAddedLines` → a fenti szabályok.
  9. `node --import tsx --test tests/no-real-emails-guard.test.ts` a `source/`-ban.
  10. Ha változott `.agents/skills/` vagy `.claude/skills/`: `skills-sync-check`.
- CLI: `node scripts/qa/gates/lint-gate.mjs [--fast|--full] [--base origin/main]`; alap: `--full`.
- Teszt: `lint-gate.test.mjs` — `scanAddedLines` igaz-pozitív és hamis-pozitív esetei; a lépéslista `--fast` / `--full` módban hamis
  futtatóval (a futtató rögzíti a hívásokat; az ESLint-bukás → kilépési kód 1).

## 4. lépés — `stage-gate.mjs`

- Export: `mapTests({ changed, testFiles, readTest, games })` → `{ tests: Set, unmapped: [] }`:
  - változott `source/tests/*.test.ts` → önmaga;
  - változott `source/**` nem-teszt fájl: (a) névtő — a teszt neve tartalmazza a fájl törzsét kebab- vagy kisbetűs alakban; (b) import —
    a teszt szövegében `/<törzs>"`, `/<törzs>'`, `/<törzs>.ts`, `/<törzs>.js` szerepel; (c) játék-csoport — a fájl útja illik a játék
    kulcsszavára → minden teszt, amelynek a neve illik rá; a közös `game-engine/` → minden játék-kulcsszavas teszt;
  - találat nélkül → `unmapped` (`WARN`: „nincs célzott teszt ehhez a fájlhoz”).
- `runStageGate`: a `runLintGate({ mode: 'fast' })` lépései + egy `node --import tsx --test <célzott> <minden *-guard.test.ts>` futás a
  `source/`-ban + változott `scripts/qa/**` esetén `node --test scripts/qa/**/*.test.mjs` (a fájllista Node-dal gyűjtve).
- Teszt: `stage-gate.test.mjs` — névtő, import, játék-csoport, `game-engine` → minden játék, teszt nélküli fájl → `unmapped`.

## 5. lépés — `pre-push-gate.mjs`

- Exportok: `parseTapFailures(tap)` (legfelső szintű `not ok` sorok fájlnevei), `decideNativeArch({ failures, doctorCode })` (D10),
  `sharedTouched(changed, cfg, slice)`, `auditFresh({ paths, now, maxAge })`, `greenCiWarning(rollup, remoteHead, localHead)`.
- `runPrePushGate({ exec, gate, base, slice })` lépései:
  1. tiszta munkafa (követett változás nincs) — különben `FAIL` „commitold előbb”;
  2. `git fetch origin --quiet` (`FAIL`, ha nem sikerül);
  3. `runLintGate({ mode: 'full' })`;
  4. teljes egységteszt: `node --import tsx --test --test-reporter=tap "tests/*.test.ts"` a `source/`-ban; bukáskor `npm run doctor:arch`,
     és `decideNativeArch` → `PASS` / `KIVÉTEL` / `FAIL`;
  5. `node scripts/qa/three-phase-check.mjs --base origin/main`;
  6. `node scripts/qa/pr-size-check.mjs --base origin/main` (túllépés → `WARN`);
  7. `git merge-base --is-ancestor origin/main HEAD`; ha nem: `WARN` + ideiglenes leválasztott munkafa az `os.tmpdir()` alatt, benne
     `git merge --no-commit --no-ff origin/main` (ütközés → `FAIL`), `source/node_modules` csomópont-hivatkozás (`junction`), az
     őr-tesztek ott; a végén a hivatkozás `fs.unlinkSync`-kel, majd `git worktree remove --force` (a hivatkozás eltávolítása ELŐTT
     soha nem rekurzív törlés);
  8. közös fájlok (`sharedFiles`; `--slice` mellett a `sliceSharedPatterns` is) → `WARN` fájllistával;
  9. `.audit-ok` frissessége a munkafa gyökerében és a fő checkoutban (a `check-audit-ok.mjs` szabálya: 10 perc, `.agentic-qa-kit.json`
     felülírhatja) → `WARN` a pontos teendővel (a kapu nem írja);
  10. `gh` elérhető: `gh pr list --head <ág> --state open --json number,headRefOid` + `gh pr view <n> --json statusCheckRollup`;
      zöld és lezárt CI a távoli fejen → `WARN` NAGYBETŰVEL (C-62); nincs `gh` → `SKIP`.
- Zöld (nincs `FAIL`) → `writeEvidence('pre-push-<fej>')`.
- Teszt: `pre-push-gate.test.mjs`.

## 6. lépés — `pre-pr-gate.mjs`

- Exportok: `classifyChanges(changed, cfg)` → `{ ui, games: [], allGames, db }`; `pickE2eSpecs({ classification, specFiles, readSpec })`;
  `checkPrBody(body)` → hiányzó szakaszok listája (elfogadási lista `- [x]` / `- [ ]` + „elfogad”, „ellenőrzés” fejléc, „nem futtatott”
  vagy „NOT RUN”); `resolveVerdict({ head, evidence, texts })` (D9).
- `runPrePrGate` lépései: a `runPrePushGate` minden lépése → `npm run build` → (UI / játék) a csomagoló konfig írása és
  `node --import tsx scripts/run-e2e-tests.ts --config playwright.gate.local.mts --workers=1 <spec-ek>` (a mobil mérő külön futás
  `--grep <játék-azonosítók>`-kal), Docker nélkül `NOT RUN` → `FAIL` → (DB) `npm run test:learning-db` Dockerrel, különben `NOT RUN`
  (`--strict` → bukás) → PR-leírás (`--body-file <út>` vagy a nyitott PR leírása) → ítélet a fejre.
- Zöld → `pre-pr-<fej>.json` ÉS `pre-push-<fej>.json`.
- Teszt: `pre-pr-gate.test.mjs`.

## 7. lépés — `pre-merge-gate.mjs <PR#>`

- Export: `decideMerge({ pr, required, checkRuns, threads, mainSha, files, verdict, guard, rt })` → lépés-eredmények; a CLI gyűjti az
  adatokat: `gh pr view <n> --json number,state,isDraft,mergeStateStatus,headRefOid,baseRefOid,files,body,comments`,
  `gh api repos/{owner}/{repo}/branches/main/protection` (`required_status_checks.contexts`), `gh api
  repos/{owner}/{repo}/commits/<fej>/check-runs?per_page=100`, GraphQL `reviewThreads(first:100){nodes{isResolved}}`,
  `gh api repos/{owner}/{repo}/branches/main` (`commit.sha`), `bash scripts/qa/active-runs-guard.sh`, `fetch(rtStatusUrl)`.
- Szabályok: E9. A main elmozdult (a PR `baseRefOid` ≠ a main csúcsa) ÉS a PR `*-guard.test.ts`-t, `scripts/qa/**`-t vagy
  `.github/workflows/**`-t érint → `FAIL` „előbb olvaszd be a maint (C-61)”; csak elmozdult → `WARN`.
- Zöld → `merge-<PR>-<fej>.json`. A `gh pr merge`-et NEM hívja.
- Teszt: `pre-merge-gate.test.mjs`.

## 8. lépés — `record-review.mjs` és `skills-sync-check.mjs`

- `record-review.mjs --head <hash> --verdict IGEN|"IGEN, FELTÉTELLEL"|NEM --report <út>`: a fej feloldása (`git rev-parse --verify
  <hash>^{commit}`), a jelentés létezik, `review-<teljes fej>.json` (`reportSha256`), kiírja a PR-sort. Hibás ítélet / fej / jelentés → 1.
- `skills-sync-check.mjs [--fix]`: a `mirroredSkills` minden elemére a két `SKILL.md` bájtazonos (CRLF → LF normalizálva); `--fix` másol.
- Tesztek: `record-review.test.mjs`, `skills-sync-check.test.mjs`.

## 9. lépés — Hook: `scripts/qa/hooks/check-quality-gates.mjs`

- Bemenet: PreToolUse JSON. Csak `Bash` / `PowerShell`. A parancs szakaszokra bontva (`&&`, `||`, `;`, `|`, újsor); egy szakasz akkor
  push / pr create / pr merge, ha (környezeti értékadások és `cd <út>` után) `git` / `gh` szóval kezdődik.
- Célkönyvtár: `git -C <út>` → előző `cd <út>` → `payload.cwd`. A `scripts/qa/gates/pre-push-gate.mjs` hiánya a cél-repóban → nincs kimenet.
- `git push`: törlés (`--delete`, `-d`, `:ág`) és `--dry-run` → enged; különben `pre-push-<HEAD>` vagy `pre-pr-<HEAD>` `ok: true` → enged,
  egyébként DENY „Futtasd: npm run gate:push (a munkafa gyökeréből), majd pusholj újra.”
- `gh pr create`: `pre-pr-<HEAD>` (vagy `--head <ág>` feloldva) → különben DENY „npm run gate:pr”.
- `gh pr merge [n]`: a PR száma és feje `gh pr view [n] --json number,headRefOid` (8 s időkorlát); `merge-<n>-<fej>` `ok: true` és ≤ 15
  perces → enged; különben DENY „npm run gate:merge -- <n>”. `gh` hiba → DENY.
- Hibánál a push / PR / merge ágon DENY (D6), egyébként nincs kimenet.
- `.claude/settings.json`: új `Bash` és `PowerShell` bejegyzés `node "scripts/qa/hooks/check-quality-gates.mjs"`, `timeout: 15`,
  `statusMessage: "Minőségkapu-bizonyíték ellenőrzése..."`; a meglévő bejegyzések változatlanok.
- Teszt: `check-quality-gates.test.mjs` — ideiglenes repó (`git init`, egy commit, `git worktree add`), `WEBSULI_QA_EVIDENCE_DIR`
  NÉLKÜL is (a közös git-könyvtár útja), mindhárom ág, törlés-kivétel, idézett `git push` nem számít, munkafa ↔ fő checkout.

## 10. lépés — Skillek

- `.agents/skills/websuli-lint-ellenor/SKILL.md`, `…/websuli-fejlesztesi-ellenor/SKILL.md`, `…/websuli-push-elotti-kapu/SKILL.md`,
  `…/websuli-pr-elotti-kapu/SKILL.md`, `…/websuli-merge-elotti-kapu/SKILL.md`; frontmatter `name`, `description` (benne: MIKOR töltsd
  be). Tartalom: menet parancsokkal, „ha bukik” ág, a kimenet értelmezése. A fejlesztési ellenőr skillben: mikor kötelező, a helyi kapuk
  előfeltétele, a kitölthető alügynök-megbízás, a tíz mért hibatípus ellenőrzőlistája (játék-specifikus + általános a „Review
  guidelines” szerint), a visszaellenőrzés rendje, az ítélet rögzítése (`record-review.mjs`).
- Tükör: `node scripts/qa/gates/skills-sync-check.mjs --fix`, majd ellenőrzés `node scripts/qa/gates/skills-sync-check.mjs` → 0.

## 11. lépés — Szabály-dokumentumok, belépők, CI

- `AGENTS.md`: „Minőségkapuk (kötelező, tulajdonosi utasítás 2026-11-17)” szakasz a kezelt `agentic-qa-kit` blokkon KÍVÜL (a
  „Befejezési mandátum” után), hat pont (terv 1. szakasz), hivatkozás a skillekre és a `docs/minosegkapuk.md`-re.
- `docs/minosegkapuk.md`: kapunként mit futtat, mért futásidő, a bukás jelentése, ismert helyi kivételek; „melyik mért hibát melyik
  kapu fogja meg” tábla (tíz típus), őszintén jelölve, amit gép nem fog meg.
- `.cursor/rules/minosegkapuk.mdc` (`alwaysApply: true`), egy-egy mondat a `docs/agent-haromfazisu-munka.md`-ben és a
  `docs/telepites-elotti-or.md`-ben.
- Gyökér `package.json`: `gate:lint`, `gate:stage`, `gate:push`, `gate:pr`, `gate:merge`.
- `.gitignore`: `qa-evidence/`, `.qa-evidence/` (a csomagoló Playwright-konfigot a meglévő `*.local.mts` fedi).
- `.github/workflows/ci.yml` „Háromfázisú rend” job: a meglévő tesztlépés bővül a `scripts/qa/gates/*.test.mjs` és
  `scripts/qa/hooks/*.test.mjs` fájlokkal; új lépés: `node scripts/qa/gates/skills-sync-check.mjs`.

## 12. lépés — Próba a saját ágon és ellenpróbák

- Mind az öt kapu valódi futása a saját ágon, mért idővel (runbookba). Ellenpróbák commit után, külön ideiglenes commitokon (a végén
  `git revert` nélkül: ideiglenes ágon, a fő ágat nem érintve):
  - lint-hiba egy ideiglenes `source/server/` fájlban → `lint-gate --fast` `FAIL`;
  - bukó egységteszt egy ideiglenes `source/tests/*.test.ts`-ben → `stage-gate` `FAIL`;
  - hiányzó végrehajtási fájl (kódváltozás `-vegrehajtas.md` nélkül, ideiglenes ágon) → `pre-push-gate` `FAIL` (háromfázisú lépés);
  - nyitott review-szál (hamis adat a `decideMerge`-nek; a valódi PR-on a szál nem nyitható szándékosan) → `FAIL`;
  - hiányzó ítélet → `pre-pr-gate` / `pre-merge-gate` `FAIL`.
- A hook valódi működése: `git push` bizonyíték nélkül → DENY (munkafából és a fő checkoutból vizsgálva).

## 13. lépés — PR

- `git merge origin/main` (rebase / force-push tilos), a saját kapuk zöldek, friss `.audit-ok` a git-gyökérben ÉS a munkafában külön
  parancsban, egy push. PR-leírás: elfogadási lista, futtatott ellenőrzések, nem futtatott + ok, a független ellenőr ítélet-sora.
- Zöld CI után nincs több push (C-62). Merge-et ez a szelet NEM végez.

## Elfogadási ellenőrzőlista

- [ ] E1–E3 lint-gate (teszt + valódi futás + ellenpróba)
- [ ] E4 stage-gate (teszt + valódi futás + ellenpróba)
- [ ] E5–E6 pre-push-gate (teszt + valódi futás + háromfázisú ellenpróba)
- [ ] E7–E8 pre-pr-gate (teszt + valódi futás + hiányzó ítélet ellenpróba)
- [ ] E9 pre-merge-gate (teszt + valódi futás a saját PR-ra + nyitott szál ellenpróba)
- [ ] E10–E12 hook (teszt munkafával és fő checkouttal + valódi DENY)
- [ ] E13 skill-tükör (teszt + CI-lépés)
- [ ] E14 CI futtatja az új teszteket
- [ ] E15 kimenet-szűrő teszttel
- [ ] Öt skill mindkét helyen, `AGENTS.md`, `docs/minosegkapuk.md`, `.cursor/rules/minosegkapuk.mdc`, két hivatkozó mondat, `.gitignore`,
      `gate:*` belépők
- [ ] Meglévő `scripts/qa/*.test.mjs` zöld, a meglévő hookok viselkedése változatlan

## Döntésnapló (ütköző követelmények)

- **Heurisztikus titok-gyanú:** az `enforce-repo-rules` `password = "…"` mintája a repó saját tesztértékein (pl.
  `SESSION_SECRET: 'test-…'`) is jelez. Döntés: a nagy biztonságú minták (privát kulcs, AWS, token-előtag, jelszavas nem-loopback
  DB-URL) `FAIL`, a heurisztika `WARN` (emberi átnézés). Indok: hamis bukás vészkijárat nélkül megállítaná a munkát.
- **Gyors mód és `tsc`:** mérve `check` 29–46 s, `check:test` 26–71 s; a `--fast` mindkettőt csak releváns változásnál futtatja (D12).
- **Ideiglenes munkafa helye (C-61-ellenőrzés):** az `os.tmpdir()` 8.3-as rövid útja (`KSAZOL~1`) a `new URL(...).pathname`-t használó
  őr-segédet (`tests/helpers/workflow-write-graph.ts`) elrontotta (hamis bukás, mérve). Döntés: a fő checkout gitignore-olt
  `.claude/worktrees/_gate-merge-*` mappája; a `node_modules` csomópont-hivatkozás előbb `unlinkSync`-kel törlődik, csak utána a munkafa.
- **Hibakezelés a hookban:** fail-open helyett (a meglévő hookok szokása) a kibocsátó parancsokon DENY — a terv D6 szigorúbb ága.
- **Commit-attribúció:** a megbízás „Claude Fable 5.2” sort kért; a commitok a futtató modell valós nevét viselik (Claude Opus 5.5) a
  rendszer-attribúció szerint.
- **A bizonyíték nem írja felül a zöld push-bizonyítékot:** a bukott `pre-pr-gate` csak a `pre-pr-<fej>` fájlt írja.
- **Független review (fej `c975c532`, IGEN, FELTÉTELLEL) leletei ebben a PR-ban javítva:** J1 (`-R …/WEBSULI` idegen mappából →
  DENY), J2 (vegyes push + törlés vizsgálva), J3 (minden refspec; `--all` / `--mirror` → DENY), J4 (burkolók, beágyazott shell,
  `gh api …/merge`), J6 (`record-review` egyezteti a jelentés `Ítélet:` sorával), J7 (nem követett fájl → a push-kapu bukik), J9
  (értékes kapcsolók), J10 (`gh pr merge --auto` → DENY), J11 (jelre is takarít), J13 (`scripts/qa` tesztek a push-kapuban), J14
  (git 3 s, gh 8 s időkorlát). Maradó kockázat (runbook „Ismert korlátok”): J5 önbevallásos ítélet-sor, J8 here-doc hamis DENY, alias.
- **Visszaellenőrzés (fej `863a521d`, NEM) — javítva:** V1 (átirányítás / záró `&` hamis DENY), V2 (`--signed`,
  `--force-with-lease` érték nélkül — megkerülés), V3 (olvasó `gh api` GET), J3 maradéka (sorfolytatás), J4 maradéka (`-lc`, `-ec`,
  `sudo -u`, `env -u`, `then` / `do`, `iex`), V4 (a runbook pontos állításai). A független ellenőr a regressziót a javító commit után
  fogta meg — pontosan ez a skill célja.
- **2. visszaellenőrzés (fej `1ed350e9`, NEM) — javítva:** W1 (a sorfolytatás eszközfüggő: PowerShellben a sor végi `\` nem
  folytatás — a hook megkapja a `tool_name`-et), W2 (a shell-kapcsoló minta újra kis- és nagybetű-független: `cmd /C`, `-C`), W3
  (`-XPUT`), W4 (`-e` / `-ec` / `-enc` kódolt parancs → DENY). W5 (idézett `'<ag>'` ref) maradó kockázat a runbookban.
- **3. visszaellenőrzés (fej `0dcc1afd`, IGEN, FELTÉTELLEL):** X1 (`env -C <dir>` a burkolóban) javítva teszttel; X2, J12, W5
  jegyre / az „Ismert korlátok” közé; J5: a merge-et végző orkesztrátor a helyi `review-<fej>.json`-t nézze.
- **#489 bot-leletek (Codex P1/P2, Vercel) — a hook FAIL-CLOSED-re cserélve (orkesztrátori döntés):** a megkerülések egyenkénti
  foltozása helyett a kapu-köteles művelet csak önálló, egyszerű, ismert alakú parancsként engedett (whitelist); minden más DENY.
  A terv D6/D7 pontját ez szigorítja: a parancs célkönyvtára mindig a hook-bemenet cwd-je (cd / -C / env -C → DENY); a távoli
  törlés csak `--delete` alakban; a kimenő commit a megnevezett ág feje. Táblázatos teszt: scripts/qa/hooks/check-quality-gates.test.mjs.
- **Külső (Gemini) ellenőr — külön, második PR:** a tulajdonos 2026-11-17-i kiegészítése (`external-review.mjs`, ellenőrzőlisták,
  skill-menet, figyelmeztető lépés a PR- / merge-kapuban) ebbe a PR-ba nem kerül: a PR már ~3500 soros, és az átadó a munka végén még
  nem készült el. A kapuk úgy készültek, hogy a figyelmeztető lépés egy újabb `gate.step`-pel bővíthető.
- **Megfigyelt mellékcsapda (meglévő hook, nem módosítva):** a `check-audit-ok` `\bgit\b…\bpush\b` mintája egy `.git/…/pre-push-…`
  útvonalat tartalmazó olvasó parancsot is push-nak vett (DENY). Kerülőút: a naplót Read / Grep eszközzel olvasni. Jegyre javasolt.
