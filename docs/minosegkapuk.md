# Minőségkapuk — runbook

Állapot: érvényes 2026-11-17-től (tulajdonosi utasítás, kötelező). Terv: `docs/specs/2026-11-17-minosegkapuk.md`, végrehajtás:
`docs/specs/2026-11-17-minosegkapuk-vegrehajtas.md`. Szabály: `AGENTS.md` „Minőségkapuk”. Skillek: `.agents/skills/websuli-*`
(forrás) és `.claude/skills/websuli-*` (bájtazonos tükör; a `skills-sync-check.mjs` és a CI őrzi).

## Miért

A 2026-11-16/17-i játékhullám öt PR-jából négynél a független review a ZÖLD CI UTÁN talált blokkoló hibát; minden ilyen kör 1–1,5 óra
CI + egy újabb review-kör volt (`docs/handoffs/2026-11-17-jatekok-utomunka-retro.md`, `docs/agent-csapdak.md` C-61…C-72). Elv: az
olcsó, helyi, determinisztikus ellenőrzés fut előbb és gyakran; a drága kör (független ellenőr, CI) csak zöld helyi kapuk után.

## A sorrend

```text
szerkesztés → gate:stage (minden szakasz után) → … → gate:push → független ellenőr + record-review
            → gate:pr -- --body-file <leírás.md> → .audit-ok → push + gh pr create → zöld CI
            → (közvetlenül a merge előtt) gate:merge -- <PR> → gh pr merge
```

Minden parancs a munkafa gyökeréből fut (`npm run gate:<x>`, vagy `node scripts/qa/gates/<x>.mjs`). Kimenet: lépésenként egy sor
(`PASS` / `FAIL` / `WARN` / `SKIP` / `NOT RUN` / `KIVÉTEL`), a végén összesítő tábla; kilépési kód 1, ha bármely lépés `FAIL`
(`--strict` mellett a `NOT RUN` is). A gyermekfolyamatok kimenete csak bukáskor jelenik meg (utolsó ~40 sor, node-tesztnél a
„failing tests” összefoglaló), szűrve: e-mail-cím, kapcsolati szöveg, token nem kerül ki. Teljes szűrt napló:
`<git-common-dir>/websuli-qa-evidence/logs/`.

## Kapunként

Mért idők: 2026-11-17, ezen a fejlesztői gépen (Windows x64, Node 26), a saját ágon, párhuzamosan futó más ügynökök mellett — a gép
terhelésétől függően ±50%.

| Kapu | Parancs | Mit futtat | Mért idő |
|---|---|---|---|
| Lint, gyors | `npm run gate:lint -- --fast` | `git diff --check`; nem követett fájlok; ESLint a változott `source/client/src` + `source/server` fájlokra; `tsc` csak változott `.ts`-nél, a teszt-`tsc` csak változott tesztnél; repó-szabályok a diffre (`repo-rules.json` + az `enforce-repo-rules` hook a hozzáadott sorokra); tiltott minták; `no-real-emails-guard`; skill-tükör | 11 s (tsc nélkül); változott `.ts`-sel ~60–90 s |
| Lint, teljes | `npm run gate:lint` | a fenti + teljes `npm run lint` + mindkét `tsc` | 146 s (lint 12 s, check 45 s, check:test 40–70 s) |
| Szakasz | `npm run gate:stage` | lint gyors + a változott fájlokhoz leképezett egységtesztek + minden `*-guard.test.ts` (23 db) + a `scripts/qa` tesztjei, ha érintett | 47 s (tsc nélkül); tsc-vel ~115 s |
| Push előtt | `npm run gate:push` | tiszta fa; `git fetch`; lint teljes; teljes egységteszt; háromfázisú rend; PR-méret; friss main (ha nincs beolvasztva: őr-tesztek az összefésült állapoton); közös fájlok; `.audit-ok`; „zöld CI utáni push” | 251 s (ebből a teljes egységteszt 132 s) |
| PR előtt | `npm run gate:pr -- --body-file <út>` | PR-leírás sablon; ítélet; a push-kapu minden lépése; `npm run build`; játék / UI: CI-azonos böngészős út; DB: `test:learning-db` | 214 s böngészős út nélkül (build 20 s); böngészős futásonként + ~160 s (füstpróba: 1 spec, 11 eset, 164 s) |
| Merge előtt | `npm run gate:merge -- <PR>` | CLEAN; kötelező ellenőrzések a jelenlegi fejen; nyitott szálak; main-elmozdulás (C-61); ítélet; futásőr; telepítés-jelzés; `/api/rt/status` | 36 s (gh-lekérdezések + futásőr + rt-végpont) |

### Külső (Gemini) ellenőr — második vélemény

`scripts/qa/gates/external-review.mjs` (terv: `docs/specs/2026-11-17-kulso-ellenor.md`; menet: `websuli-fejlesztesi-ellenor` skill
4/b). A Claude-alügynökös ellenőr MELLETT, ugyanarra a fejre; kulcs csak `GEMINI_API_KEY` / `--env-file`; titok-szűrés a küldés előtt;
`--record` → `external-<fej>.json`. A `pre-pr-gate` és a `pre-merge-gate` „külső (Gemini) ellenőr” lépése csak `WARN` / `PASS` —
soha nem bukás. Ellenőrzőlisták: `scripts/qa/gates/external-review/checklist-{game,general}.md`.

- **Költségkorlát:** `--dry-run` (csak `countTokens`, ingyenes) előbb; hívásonként a kimenet + gondolkodás felső korlátja
  131 072 token (Interactions háttér-mód); a stdout utolsó sora és a jelentés vége a token-felhasználást (bemenet / gondolkodás /
  kimenet) rögzíti. Időtúllépést / megszakadt kapcsolatot nem ismétel (már számlázott), csak 429 / 5xx-et.
- **Siker csak kész jelentéssel:** nem üres válasz + `finishReason` STOP + ítélet-fejezet; különben `.hianyos.md`, nem nulla
  kilépés, `incomplete` / `blocked` bizonyíték → a kapu: „a második vélemény HIÁNYZIK”.
- **A külső modell állításai nem tények:** nem lát a repóba; minden kritikus / magas leletét az orkesztrátor a kódból visszaellenőrzi
  (MEGERŐSÍTVE / CÁFOLVA / NEM ELDÖNTHETŐ).

### Tiltott minták (a diff hozzáadott soraiban, `FAIL`, érték kiírása nélkül)

`.only(` / `.skip(` / `fixme(` / `xit(` / `{ only: true }` tesztfájlban; `git … --no-verify` szkriptben (`scripts/`, `*.sh`,
`*.ps1`, `package.json`, `.github/`); privát kulcs blokk; AWS-kulcs; GitHub / Anthropic / Slack token-előtag; jelszavas adatbázis-URL
nem-loopback gépre. A `console.log` tiltását az ESLint `no-console` + `--max-warnings 0` adja (nem duplikáljuk). Az
`enforce-repo-rules` heurisztikus titok-gyanúja (`password = "…"`) csak `WARN` — emberi átnézés; a valódi titok-mintát a fenti szabály
viszi bukásra.

### Ismert helyi kivétel

- **`native-arch` (C-38):** friss munkafában (`npm ci --ignore-scripts`) a `better-sqlite3` natív kötése nem épül fel, ezért a
  `native-arch.test.ts` és a `doctor:arch` helyben bukik. A push-kapu ezt `KIVÉTEL`-ként jelzi, de CSAK akkor, ha (a) ez az egyetlen
  bukó tesztfájl és (b) a `doctor:arch` is bukik. A CI `native-arch` jobja x64-en és ARM64-en futtatja. Más bukás mellett, vagy zöld
  `doctor:arch` mellett: `FAIL`.

### A bizonyíték és a hook

- A kapuk a fej-commitra írnak bizonyítékot: `<git-common-dir>/websuli-qa-evidence/{pre-push,pre-pr}-<fej>.json`,
  `merge-<PR>-<fej>.json`, `review-<fej>.json`. A közös git-könyvtárat a fő checkout és minden munkafa ugyanúgy látja (a fő
  checkoutban `.git/`, munkafában a `git rev-parse --git-common-dir`), ezért a munkafában futtatott kapu bizonyítékát a fő checkoutból
  kiadott (ott egyszerű parancsként futó) push hookja is megtalálja. Nem commitolható.
- `scripts/qa/hooks/check-quality-gates.mjs` (PreToolUse, Bash + PowerShell) — CSAK OLVAS, **FAIL-CLOSED** (a #489 bot-leletei
  után): a kapu-köteles műveletet CSAK önálló, egyszerű, ismert alakú parancsként engedi át. Ha ugyanabban a parancsban láncolás
  (`&&`, `||`, `;`, `|`, `&`, újsor), alshell / parancshelyettesítés (`( )`, `{ }`, `$( )`, backtick), átirányítás
  (`<`, `>`), könyvtárváltás vagy környezet-burkoló (`cd`, `pushd`, `Set-Location`, `env`, `sudo`, `GIT_*=`, `git -C`,
  `-c`, `--git-dir`, `--work-tree`, PowerShell `&`, `Start-Process`, `cmd /c`, `bash -c`, `iex`) vagy ismeretlen kapcsoló van
  → DENY: „a push / PR / merge külön, egyszerű parancsként fusson a munkafa gyökeréből”.
  - **Engedett `git push` alakok:** `git push`, `git push <remote>`, `git push [-u] <remote> <helyi ág>`, `git push <remote> HEAD`,
    `git push <remote> HEAD:<az aktuális ág>`. A bizonyíték a ténylegesen kimenő commitra kell (a megnevezett helyi ág feje, nem a
    HEAD, ha eltér): zöld `pre-push-<commit>` vagy `pre-pr-<commit>`.
  - **Távoli ág törlése kapu nélkül:** CSAK `git push <remote> --delete <ág>`; a `:<ág>` alak DENY („használd a --delete alakot”).
  - **DENY:** `:` / `+` refspec, `--all`, `--mirror`, `--tags`, `--repo`, `--force*` / `-f` (a force-push a repó szabálya
    szerint amúgy is tilos; a `check-destructive` a main/master force-pusht külön is tiltja), több refspec, `HEAD:<más ág>`,
    leválasztott HEAD, bármely más kapcsoló.
  - **`gh pr create`:** ismert kapcsolók (`--title`, `--body-file`, `--base`, `--head`, `--draft`, `--label` …); zöld
    `pre-pr-<fej>` kell. A leírást `--body-file`-lal add (a backtick / `$( )` a parancsban DENY).
  - **`gh pr merge [<szám>|<PR-URL>|<ág>]`:** az értékes kapcsolók (`--subject`, `--body`, `--body-file`, `--match-head-commit`,
    `--author-email`, `-R/--repo`) értéke nem cél; több / nem egyértelmű cél → DENY; cél nélkül az aktuális ág PR-ját a hook
    `gh pr view --json number,headRefOid`-dal oldja fel. A PR JELENLEGI fejére szóló, legfeljebb 15 perces zöld `merge-<n>-<fej>`
    kell. `--auto` → DENY; `gh api …/pulls/<n>/merge` → DENY.
  - Önálló, nem futtató eszközben (`echo "git push"`, `grep -rn "git push" docs`) az idézett szöveg nem számít; futtató eszközben
    (`bash -c`, `iex`, `cmd /c`, `env`, `node` …) és láncolt parancsban fail-closed DENY. Útvonallal megadott `git` / `gh` is DENY.
  - Más repó (amelyben nincs `scripts/qa/gates/pre-push-gate.mjs`): nincs kimenet — kivéve, ha a parancs szövege a WEBSULI-ra mutat.
  - Hibánál (pl. a `gh` nem válaszol) a kibocsátó parancsra DENY. A meglévő `check-audit-ok`, `check-destructive`,
    `enforce-repo-rules` hookok változatlanok és függetlenek.
- **A hook NEM biztonsági határ** a szándékos megkerülés ellen (pl. a hook kikapcsolása, szkriptfájlból indított push, idézés- /
  escape-trükk a parancsnévben, `git send-pack`, `gh api graphql` merge-mutáció): a figyelmetlen
  hibát fogja meg. A megkerülés tilos, és az orkesztrátornál a `pre-merge-gate` mindenképp lefut.
- **Időtúllépéskor is tilt (kanban #100):** ha a `git` / `gh` nem válaszol a konfigurált korláton belül (`gates.config.json`:
  `hookGitTimeoutMs` 10 s, `hookGhTimeoutMs` 15 s, a teljes keret `hookBudgetMs` 45 s, a Claude Code 60 s-os hook-időkorlátja
  alatt), a hook DENY-t ad („a repó állapota nem állapítható meg — próbáld újra”). Az ügynök teendője: néhány másodperc múlva
  ugyanazt az egyszerű parancsot újra kiadni; a kaput megkerülni tilos. „Más repó”-nak csak a gyors, nem nulla kilépés számít, és
  az sem, ha a mappa vagy a parancs a WEBSULI-ra utal. Értelmező + szkriptfájl (pl. `node kanban.mjs note 5 "…"`) idézett
  argumentumában a „push” szó nem kapu-köteles; `-e` / `-c` kiértékelésnél, láncolásnál továbbra is tilt. A hook a parancsot a
  héj (Bash- / PowerShell-eszköz) szabályai szerint bontja, és a nem egyértelműen értelmezhető idézésű parancsot tiltja. A szokásos
  PR-cím / merge-tárgy (tipográfiai idézőjel, `(#92)`) nem tilt; PowerShellben a tipográfiai idézőjel lezárja a szöveget, ezért
  ott a kapu-köteles szót tartalmazó idézetet egyenes idézőjellel írd, vagy használd a Bash-eszközt.
- **A hook a projektgyökérhez kötött (kanban #100, 2. kör):** minden hook-parancs `node "${CLAUDE_PROJECT_DIR}/scripts/qa/hooks/…"`,
  így alkönyvtárból (`source/`, munkafa) is lefut; a `scripts/qa/hooks/settings-hooks.test.mjs` a valódi settings-et méri. Ha maga a
  hook-folyamat nem indul el, összeomlik vagy túllépi a 60 s-os külső korlátot, azt a Claude Code alapbeállítással NEM tiltásként
  kezeli — ezért a hook a döntést a saját 45 s-os keretén belül hozza meg.
- **Élő próba a #490 merge-e után (orkesztrátor, kötelező, a következő kibocsátás előtt):** új munkamenet a fő checkout gyökeréből
  (a settings induláskor töltődik be); a Bash-eszközzel `node -e "console.log('git push')"` → elvárt: tiltás (`[minőségkapu]` vagy
  az audit-hook). Ugyanez külön `cd source` után, majd mindkét helyen a PowerShell-eszközzel. Ha bármelyik nem tilt (a szöveg
  kiíródik, vagy „hook error … Cannot find module” látszik): a `.claude/settings.json` tíz `command` sorát az Edit eszközzel vissza
  a `node "scripts/qa/hooks/<hook>.mjs"` alakra, új munkamenet, és a próba újra a gyökérből — addig push / PR / merge nincs.
  Követő jegy: a héj nélküli, `args`-os hook-alak (`"command": "node", "args": ["${CLAUDE_PROJECT_DIR}/…"]`), amelyet a
  hooks-dokumentáció útvonal-helyőrzőhöz ajánl.
- **Feltöltés munkafából alügynökként:** az alügynök parancsai a fő checkoutból indulnak (a `cd` nem marad meg, láncolni tilos),
  ezért a munkafa ágát a fő checkoutból kell felküldeni egyszerű parancsként: `git push origin <ág>`. A hook ilyenkor a megnevezett
  helyi ág fejére szóló bizonyítékot nézi.
- **C-61 (main elmozdult a PR CI-ja óta, kanban #92):** a `pre-merge-gate` a main elmozdulásának fájllistáját a GitHub compare
  végpontjából olvassa, és a `gates.config.json` `repoWideScopes` táblázata szerint dönt. **FAIL**, ha a PR egy repó-szintű
  ellenőrzést érint (`*-guard.test.ts`, `scripts/qa/**`, `.github/workflows/**`), és a main olyan fájlt változtatott, amelyet az
  ellenőrzés olvas: az őröknél és a workflow-nál bármit (`.*`), a `scripts/qa/`-nál a `scripts/qa/`, `.claude/settings.json`,
  `docs/specs/`, `render.yaml`, `.agents/skills/`, `.claude/skills/`, `.github/workflows/` alatt (indoklás fájl:sorral a konfigban;
  átnevezett fájlnál a régi név is számít). FAIL akkor
  is, ha a fájllista nem olvasható, csonka (≥ 300) vagy üres eltérő SHA mellett, illetve ha a hatókör-táblázat hiányzik vagy hibás.
  **WARN**, ha a main elmozdult, de nincs metszet (pl. csak játékkód változott egy `scripts/qa`-s PR mellett). **PASS**, ha a CI a
  jelenlegi mainnel futott.
- A hook csak a WEBSULI-ból indított Claude Code munkamenetekre hat (a `.claude/settings.json`-t a munkamenet induláskor olvassa —
  a merge után induló munkamenetektől érvényes). Más ügynököt (Codex, Cursor) az `AGENTS.md`, a skillek és a `.cursor/rules` köt.

## Push-fegyelem (átmeneti kapu-szabály 5–8., 2026-11-17)

1. Main-merge-et CSAK akkor pusholj, ha a PR ütközik a mainnel, vagy ha az orkesztrátor kéri — a csak-merge push is újraindítja az
   ~1 órás kötelező E2E-t (helyben beolvaszthatod a push előtti kapuhoz).
2. Lecserélt (régi) fej CI-bukására ne reagálj új pushsal: előbb a JELENLEGI fej CI-ja, és hogy a bukó teszt ismert ingadozó-e;
   ingadozás-gyanúnál ne módosíts termékkódot találomra — jelentsd a teszt nevével és a hibaüzenettel.
3. Push után EGY hosszú figyelő a CI végére; közbenső „még fut” jelentés nélkül.
4. Zöld CI-jú fejre csak blokkoló lelet javításáért pusholj — és akkor is mindent egy pushban.

## Gépi zár — `machine-lock.mjs` (egy sáv, kötelező 2026-11-19)

Terv: `docs/specs/2026-11-19-gepi-zar.md`. Skill: `websuli-gep-zar`. Szabály: `AGENTS.md` „Gépi zár”. Ez az alfejezet felvált minden
korábbi, munkamenet-ideiglenes zárat (két sáv `lock` / `lock2`, `kovetkezo.txt`).

- **Miért:** két nehéz kör egyszerre a gépen időzítésfüggő hamis bukást ad (kanban #205: 60,6 s a 60 s-os korláttal szemben; #206:
  `setTimeout`-sorrend), a tesztek önmagukban zöldek.
- **Parancs:** `node scripts/qa/machine-lock.mjs run --name <név> --timeout-min <perc> [--max-wait-min <perc>] -- <parancs> [arg…]`
  (`npm run machine-lock -- run …`); állapot: `node scripts/qa/machine-lock.mjs status [--json]`.
- **Magától a zár alatt:** gyökér `npm test` (60 perc), `npm run test:e2e` (150), `npm run test:learning-db` (45), `npm run verify` (90),
  `npm run check` / `check:test` (20), `npm run gate:stage` (30), `npm run gate:lint` (30), `npm run gate:push` (90), `npm run gate:pr`
  (300 — a `pre-pr-gate.mjs` önmaga áll sorba, a közvetlen `node` hívásnál is). A `stage-gate.mjs`, `lint-gate.mjs` és
  `pre-push-gate.mjs` közvetlen `node` hívása NEM áll sorba — azt a `machine-lock.mjs run` alá kell tenni. A `gate:merge` nem nehéz
  (gh-lekérdezések), nincs a zár alatt.
- **A `gate:stage` is nehéz** (mért, 2026-11-19): egy zár nélküli `gate:stage` (teljes `tsc` + célzott egységtesztek) egy párhuzamos
  `gate:push` mellett hamis bukást okozott (`claude-stream-thinking-liveness.test.ts`, 250 ms-os falióra-korlát). Ára: a szakasz-kapu
  egy futó nehéz kör mögött vár (legfeljebb annak időkorlátjáig).
- **Működés:** atomi beállás a sorba (`state.mutex/` + `counter` + `queue/<sorszám>.json`, `wx`); zárat csak a sor első élő eleme
  szerez (`mkdir lock/`, `lock/owner.json`: név, PID, gyerek PID, gép, parancs, kezdés UTC, időkorlát, a token SHA-256 lenyomata —
  a nyers tokent csak a gyerek környezete kapja); a parancs AZONNAL gyerekként fut időkorláttal; a végén — hiba, időtúllépés (124),
  Ctrl+C (130), SIGTERM (143) esetén is — a saját gyerek leáll (POSIX: folyamatcsoport, SIGTERM → türelmi idő → SIGKILL; Windows:
  `taskkill /PID <gyerek> /T /F`), a zár elenged, a bejegyzés törlődik; kilépési kód a parancsé. A várakozó 60 s-onként kiírja a helyét
  és a gazdát; `--max-wait-min` lejártakor 75 — a határidő a foglalási kísérlet ELŐTT dönt, a várakozás a hátralévő időre korlátozott,
  így lejárt várakozás után a parancs nem indul el.
- **Az állapot-mutex** (`state.mutex/`, gazdája `holder.json`-t ír): a sorba állás, a megszerzés, az elavult zár visszavétele, a
  gazda-fájl frissítése és az elengedés ugyanez alatt dönt és cselekszik — a régi gazda így nem bonthatja le az új gazda zárát. Az
  elengedés félreteszi a `lock/`-ot (átnevezés) és a mutexen kívül takarít; ha az átnevezés nem sikerül, a `lock/`-ot nem törli
  (elavultként veszik vissza). A mutex elavult, ha a gazdája ugyanazon a gépen nem él, vagy 60 s-nál régebbi.
- **A folyamatfa leállása a zár előtt (POSIX):** a gyerek saját folyamatcsoportot kap; a kilépése után a zár csak az üres csoport után
  szabadul fel (SIGTERM → `WEBSULI_MACHINE_LOCK_KILL_GRACE_MS`, alap 10 s → SIGKILL → legfeljebb 5 s). Az újrabelépő `run` gyereke a
  szülő csoportjában marad (a felügyelt határon belül). Windows-on a rendes kilépés után leválasztott unokák nem követhetők (korlát).
- **Kényszerleállítás után konténer-takarítás:** időtúllépésnél / megszakításnál a futás ALATT keletkezett saját eldobható Postgres-
  konténer (`websuli-e2e-*`, `websuli-learning-test-*`) leáll (`docker stop`), a futás előtt már meglévő (más futásé) érintetlen. A
  rendes kilépésnél a harness maga takarít. `WEBSULI_MACHINE_LOCK_DOCKER_CLEANUP=0` kikapcsolja (csak teszt).
- **Elavult zár / bejegyzés:** visszavehető, ha a gazda és a gyereke ugyanazon a gépen nem él, vagy a kezdés + időkorlát + türelmi idő
  (`WEBSULI_MACHINE_LOCK_GRACE_MIN`, alap 10 perc) lejárt, vagy 60 s után sincs gazda-fájl; a sorbejegyzés, ha a PID nem él vagy az
  életjel 5 percnél régebbi. Atomi átnevezéssel, naplózva: `<zár-mappa>/events.log` (UTC). Élő folyamatot a szkript soha nem állít le.
- **Újrabelépés:** a gyerek `WEBSULI_MACHINE_LOCK_HELD=<token>`-t örököl; csak a jelenlegi, élő, nem lejárt gazda tokenje érvényes (a
  `gate:pr` belső `npm run build` / `test:learning-db` hívása így nem vár a saját szülőjére). Hamis / régi token → figyelmeztetés, sorba
  állás. A token nem kerül a gazda-fájlba és a `status` (szöveges / `--json`) kimenetébe; a `--json` engedélylistás mezőket és számolt
  `ranMinutes` / `waitedMinutes` értéket ad (`nowUtc` pillanatképből).
- **Hely:** `<git-common-dir>/websuli-machine-lock/` (a szkript saját repójáé — fő checkout, munkafa, ideiglenes munkafa ugyanaz);
  `WEBSULI_MACHINE_LOCK_DIR` felülírja (teszt). CI-ben (`CI` igaz, nem `false` / `0`) átenged. Git és változó nélkül: kód 2, a parancs
  nem fut.
- **Ismert korlátok:** a PID-ellenőrzés csak ugyanazon a gépen érvényes; Windows-on a `run` kemény leállítása (TerminateProcess) után
  a gyerek tovább futhat — a zár addig foglalt, utána elavult; a zár a Node-folyamatokra hat, a kézzel, zár nélkül indított nehéz kört
  nem látja (szabály: `AGENTS.md`). A cmd.exe `%VAR%` kifejtését Windows-on az npm-parancs argumentumában nem lehet idézéssel tiltani.

## Melyik mért hibát melyik kapu fogja meg

| # | Mért hibatípus (2026-11-16/17) | Gép fogja meg? | Melyik kapu / mi |
|---|---|---|---|
| 1 | Véletlen válasz (élesítés nélkül, a kérdés előtti bemenet, húzás = koppintás) | **Nem** általánosan | Fejlesztési ellenőr, 4.A/1. A böngészős út csak a meglévő spec-ek eseteit futtatja; új eset (tartott tűz, húzás a táblán) e2e-je a szelet feladata |
| 2 | Kupon módban elfogynak a kérdések | Részben | Fejlesztési ellenőr 4.A/2; a `pre-pr-gate` futtatja a lejárt-kupon spec-et, de a kimerülést csak célzott teszt méri |
| 3 | Levágott / takart válasz keskeny / fekvő nézetben | Részben | `pre-pr-gate` a mobil mérőt futtatja (átfedés, 48 px, vízszintes görgetés); a leghosszabb bank-válasz esetét csak a fejlesztési ellenőr 4.A/3 (valódi szélesség) fedi |
| 4 | A sim nem a lap magját / szabályát méri | **Nem** | Fejlesztési ellenőr 4.A/4 |
| 5 | Győzelem vereségre fordul ugyanabban a lépésben | **Nem** | Fejlesztési ellenőr 4.A/5 |
| 6 | Megállítási okok egymást feloldják | **Nem** általánosan | Fejlesztési ellenőr 4.A/6; a meglévő `game-explanation-pause` / lejárt-kupon spec-ek a `pre-pr-gate`-ben |
| 7 | Helyben zöld, CI-n (szoftveres WebGL, buildelt szerver) piros | **Igen** | `pre-pr-gate`: csomagoló konfig SwiftShaderrel, buildelt szerver, `workers=1`, eldobható Postgres — a CI útja |
| 8 | Repó-szintű őr elavult zöldre vonva pirosra tette a maint (C-61) | **Igen** | `stage-gate` (minden őr), `pre-push-gate` (összefésült állapoton), `pre-merge-gate` (main elmozdult + őrt érint → bukás) |
| 9 | Zöld CI utáni push újraindítja az 1 órás E2E-t (C-62) | Figyelmeztetés | `pre-push-gate` NAGYBETŰS figyelmeztetés (a `gh`-tól olvasott állapot); a döntés az ügynöké |
| 10 | Alügynök közös fájlhoz nyúl / a D:\ gyökerébe ír / `git checkout`-tal állít vissza | Részben | `pre-push-gate` közös-fájl figyelmeztetés (`--slice`: a közös modulok is); a nem követett fájl figyelmeztetés; a gyökérbe írást és a `git checkout`-ot csak a fejlesztési ellenőr 4.B/16 és a skillek szabálya fedi |

Őszintén: a játéklogikai hibák (1, 4, 5, 6) jellemzően szándék- és állapottér-hibák; ezeket determinisztikus kapu általánosan nem
ismeri fel. Ezért kötelező a független ellenőr — a kapuk feladata, hogy az ellenőr ne az olcsó hibákra költsön.

## Ismert korlátok (maradó kockázat)

- **Az ítélet önbevallásos** (review J5): a `Független ellenőr ítélete: IGEN (fej: …)` sort bárki beírhatja a PR-leírásba; a kapu
  a sor meglétét ellenőrzi, nem a jelentés valódiságát. A helyi `review-<fej>.json` a jelentés hash-ét is rögzíti, és a
  `record-review` a jelentés saját `Ítélet:` sorával egyezteti — a merge-et végző orkesztrátor ezt a helyi bizonyítékot nézze.
- **Hamis DENY (fail-closed):** láncolt parancsban, idézett szövegként előforduló `git … push` / `gh pr merge` is DENY-t ad (pl.
  `git add . && git commit -m "push fix"`) — a commit-üzenetet fájlból add (`git commit -F <fájl>`), a kibocsátást külön parancsban.
- **A main-elmozdulás mérése** a CI-futás `base.sha`-ján alapul; ha az üres, a PR `baseRefOid`-jára esik vissza (UNVERIFIED, hogy
  minden esetben a CI alapja-e — jegyre javasolt).
- **A merge-kapu a PR-kommentek szerzőjét nem szűri** (nyilvános repó: bárki írhat ítélet-sort) — a helyi `review-<fej>.json` a
  megbízható forrás.
- **Git-alias** (`git config alias.p push`): `git p` nem ismerhető fel olcsón — a hook nem biztonsági határ (lásd fent).
- A hook csak a Claude Code munkamenetekre hat; Codex / Cursor / ember a skillek és az `AGENTS.md` szerint futtatja a kapukat.

## Ha bukik

1. Olvasd el a `FAIL` sort és alatta a kimenetet; a kapu megnevezi a teendőt.
2. Javítsd az okot (tesztet gyengíteni, kihagyni tilos), futtasd újra ugyanazt a kaput. Ugyanazt a bukó parancsot változatlan
   bemenettel újrafuttatni tilos.
3. Ha a kapu hibás (hamis riasztás): a kaput javítsd (`scripts/qa/gates/` + teszt), ne kerüld meg. Vészkijárat nincs.

## A kapu-hook hibája (`onFailure: "block"`, tulajdonosi döntés 2026-11-18)

- A `.claude/settings.json` kapu-hook bejegyzésein (Bash, PowerShell) `"onFailure": "block"`: ha a hook-folyamat nem indul,
  összeomlik, túllépi a 60 s-os külső korlátot vagy érvénytelen kimenetet ad, a Claude Code a parancsot **tiltja** (alapból
  átengedné). A többi hookon (`check-audit-ok`, `check-destructive`, `enforce-repo-rules`, `warn-test-edit`) nincs ilyen beállítás: minden
  Bash / PowerShell / Edit / Write hívásra futnak, a hibájuk minden munkát megállítana; a pusht a kapu-hook fedi.
- A hook saját „nem válaszolt” tiltása (a git / gh nem válaszolt, a keret elfogyott) és az audit-hook (`check-audit-ok`) ugyanilyen
  tiltása a teendőt is megmondja: **néhány másodperc múlva ugyanazt az egyszerű parancsot újra.** Az audit-hook a git
  időtúllépésekor / indítási hibájakor és belső hibájakor push-parancsra tilt (kanban #126; a belső git-korlát 10 s, a külső hook-korlát 20 s); nem push parancsnál és nem git-repóban
  enged.
- **Ha tartósan fennáll** (pl. minden Bash / PowerShell parancs tiltott, mert a hook-szkript elromlott — félbemaradt összefésülés,
  szintaxishiba, hiányzó `node`): az ügynök **kizárólag a hookot javíthatja** — az Edit / Write eszközzel (azon nincs
  `onFailure`) a `scripts/qa/hooks/check-quality-gates.mjs`-ben, a hibát lefedő teszttel együtt. A védelmet (a `"onFailure"`
  beállítást, a hook-bejegyzést vagy bármely hookot) az ügynök **nem távolíthatja el, nem gyengítheti, és kerülőútként sem
  javasolhatja** — ez a kapu megkerülése, ami tilos (AGENTS.md: „ha a kapu hibás, a kaput kell javítani”).
- **Ha a javításhoz nincs futtatókörnyezet** (pl. nincs `node`), vagy a javítás maga is csak a tiltott úton (a védelem kikapcsolásával) volna
  elvégezhető: az ügynök **megáll**, és a tulajdonostól kér segítséget — leírja a hibát, a kipróbált lépéseket és a javasolt
  hook-javítást.
- **A settings-fájlok jogosultsági tiltás alatt állnak** (tulajdonosi döntés 2026-11-18): a `.claude/settings.json`
  `permissions.deny` listája (`Edit(/.claude/settings.json)`, `Edit(/.claude/settings.local.json)`, valamint a repón belüli munkafákra
  `Edit(/.claude/worktrees/**/.claude/settings.json)` és `Edit(/.claude/worktrees/**/.claude/settings.local.json)`) minden módban
  megtiltja, hogy ügynök ezeket a fájlokat írja. **Ezután a beállítás csak a tulajdonos kezével módosítható.** A pontos kör a
  hivatalos dokumentáció szerint (https://code.claude.com/docs/en/permissions — az `Edit(...)` szabály a beépített fájlszerkesztő
  eszközökre vonatkozik; a `/…` alak a projektgyökérhez, a `//…` a fájlrendszer gyökeréhez, a `~/…` a saját könyvtárhoz horgonyzott;
  a minta gitignore-szintaxisú):
  - **Fedett:** a beépített fájlszerkesztő eszközök (Edit, Write, NotebookEdit), és Bash-ben a kimeneti átirányítás (`>`, `>>`, `2>`)
    és a `tee` célja; a `/` a munkamenet fő munkakönyvtárához horgonyzott — ha a munkamenet a repó gyökerében indul, a fenti négy útvonal.
  - **Nem fedett:** a felhasználói settings (`~/.claude/…` — a tulajdonos saját beállítása, repóból nem korlátozzuk; ezért nincs `//**`
    alakú tiltás sem); a repón kívüli munkafa (pl. ideiglenes mappában) és a nem a repó gyökerében indult munkamenet; a PowerShell
    fájlírása (a dokumentáció az átirányítás-ellenőrzést csak Bash-re írja le); az MCP-fájlírók; a fájlt maga megnyitó szkript (pl.
    Node / Python). Ezeket a munkamenetben semmi nem fogja meg — ilyen
    írás a kapu megkerülése, tilos. (A beállítás-változást figyelő hook a következő hook-szelet tétele, kanban.)
- **A hookok kikapcsolása ellen** a projekt-settingsben a hookok kikapcsoló kulcsa kifejezett hamis értékkel áll. A hivatalos
  dokumentáció szerint (https://code.claude.com/docs/en/hooks, „Disable or remove hooks”) a projekt-settings hamis értéke felülírja a felhasználói
  settings igaz értékét; egy futásra szóló parancssori beállítás ennél erősebb — azt repóból nem lehet lefedni.
- **A hook-szkript gyengítése ellen** a valódi védelem a CI-ben futó viselkedési hook-tesztek (`settings-hooks.test.mjs`,
  `hook-failure.test.mjs`, `check-quality-gates.test.mjs`): a gyengített hook a PR-ban bukik. A `scripts/qa/repo-rules.json`
  védő szabályai csak szűk, szó szerinti alakokat fognak — riasztók, nem biztonsági határ; amit átengednek, az sem megengedett.
- **A védelem ideiglenes kikapcsolása kizárólag a tulajdonos saját kezű lépése** (kézzel, a saját gépén; utána vissza). Az ügynök
  ezt nem végezheti el, és nem is javasolhatja kerülőútként.

## Ellenpróbák (2026-11-17, a bevezető PR-ban)

A bevezető PR leírása tartalmazza a parancsokat és a kimenet lényegét: lint-hiba → `lint-gate --fast` FAIL; bukó egységteszt →
`stage-gate` FAIL; végrehajtási fájl nélküli kód → `pre-push-gate` FAIL (háromfázisú rend); hiányzó ítélet → `pre-pr-gate` FAIL;
nyitott review-szál → `pre-merge-gate` FAIL (egységteszt); bizonyíték nélküli `git push` → hook DENY.
