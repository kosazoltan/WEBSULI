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
  átnevezett fájlnál a régi név is számít), vagy a fájllista nem olvasható / csonka (≥ 300) / üres eltérő SHA mellett. **Ilyenkor a
  kapu NEM kér új CI-t** (kapu-gyorsítás, tulajdonosi döntés 2026-11-19): lekéri a PR fejét és a friss maint (hash-egyezéssel a
  GitHub-adatokhoz), és ideiglenes, leválasztott munkafában lefuttatja a **gépi összefésült próbát** (`scripts/qa/gates/merged-probe.mjs`,
  ugyanaz a kód, mint a push-kapu C-61 lépése és a `gate:carry`). **Pontosan ezt futtatja** (`probeScope`, a PR-fájlok = `merge-base..fej`,
  a main-fájlok = `merge-base..friss main`):
  1. **minden** `source/tests/*-guard.test.ts` őr-tesztet — előbb a friss mainen, utána az összefésült fán; a main az alsó korlát:
     a mainen létező, de az összefésült fáról hiányzó őr → FAIL; őrönként kevesebb lefutott teszt, mint a mainen → FAIL; 0 őr → FAIL;
  2. ha a PR **és** a main elmozdulása is érint `source/`-t → a **teljes** `source/tests/*.test.ts` egységtesztkört; különben csak a PR
     által módosított `source/tests/*.test.ts` fájlokat;
  3. ha a PR **vagy** a main elmozdulása érint `scripts/qa/`, `.github/workflows/`, `.claude/` vagy `.agents/skills/` fájlt → a
     **teljes** `scripts/qa` (`*.test.mjs`, a `gates/` és `hooks/` alatt is) kört + `skills-sync-check` + `three-phase-check`; különben
     csak a PR által módosított `scripts/qa` teszteket.
  A futás együttes időkorlátja 10 perc; összesen 0 lefutott teszt → FAIL. **Mérce (tulajdonosi döntés 2026-11-19): ≤ 7 perc** a teljes
  egységkörös legrosszabb esetre; a kanban #205 (időérzékeny teszt hamis bukása gépterhelés alatt) megoldásáig a merge-kapu próbája
  bukáskor **pontosan egyszer** újrafut — a naplóban és a `merge-probe-` bizonyítékban jelölve (`attempts: 2`, `retried: true`, az 1.
  futás oka, a megjegyzésben „ÚJRAFUTTATVA (#205)”); a második bukás FAIL. Zöld → PASS (a darabszám, az összefésült fa, a hatókör és az
  időtartam a `merge-probe-<PR>-<fej>` rekordban); ütközés / piros / időtúllépés / hiányzó `source/node_modules` (előbb `npm.cmd ci`)
  → FAIL. **Előfeltételek (vak review L3):** a próba PR-kódot futtat, ezért csak akkor indul, ha a PR ugyanebből a tárolóból jön
  (fork-PR → FAIL, új CI kell), a kötelező ellenőrzések zöldek, és **a fejre MEGBÍZHATÓ, helyi ítélet van rögzítve** (`record-review`
  → `review-<fej>.json`; 3. vak kör L1) — a PR-leírás / komment ítélet-sora a próbát nem indíthatja. A gyermekfolyamat szűrt
  környezetet kap (engedélylista; titok-, token-, kulcsnevek nélkül), a `node_modules` csomópont-hivatkozás marad (a maradó kockázatot
  lásd az „Ismert korlátok” alatt). A PR fájllistája mindig a lapozott REST-listából (az átnevezett fájl régi neve is); csonka lista →
  FAIL; a próba saját git-listája `--no-renames`. **A main rögzített SHA** (3. vak kör L4): a próba a merge-kapu elején a GitHubtól
  olvasott main SHA-n fut (nem a mozgó `origin/main` refen); a próba után a kapu újra lekérdezi a maint — elmozdult → FAIL; a futásőr és
  az RT-állapot a próba UTÁN készül; a `merge-<PR>-<fej>` bizonyíték a `mainSha`-t is tárolja, és a `check-quality-gates` hook a
  merge előtt a GitHub szerinti main csúccsal egyezteti (eltérés vagy régi, `mainSha` nélküli rekord → DENY, futtasd újra a
  `gate:merge`-et). A segéd-refek futásonként egyediek, és minden úton törlődnek. **Határidő** (3. vak kör L9): egy próbára egy
  együttes, monoton határidő (10 perc); minden lépés — a git is — a fennmaradó időt kapja, lejárt keretnél FAIL; a main őr-alapmérésének
  bukása FAIL (L5); a teljes QA-körben a `skills-sync-check` / `three-phase-check` hiánya FAIL (L6), és a háromfázisú ellenőrző egy
  szintetikus merge-commiton (szülők: a fej és a main) fut (L7). A `merge-probe-` rekord: összidő, futásonkénti idők, hatókör. A
  hiányzó vagy hibás hatókör-táblázat továbbra is FAIL (konfighiba).
- **Bizonyíték-átvitel főág-beolvasztás után (`npm run gate:carry -- --from <régi fej>`):** ha az új fej egy ütközésmentes
  main-beolvasztás (két szülő: a régi, bizonyítékkal rendelkező fej és az `origin/main` egy őse; a gépi összefésülés fája = az új fej
  fája), és a PR saját változása bájtra azonos (`git patch-id --verbatim`), a szkript az új fejen lefuttatja az összefésült próbát
  (ugyanazzal a hatókörrel, mint a merge-kapu, lásd fent; a hatókör történeti alapja a régi, ellenőrzött fej — 3. vak kör L3 —,
  a main a rögzített, GitHubbal egyeztetett SHA), és zöld esetén átviszi a vak ítéletet (`review-`) és a `pre-push-` /
  `pre-pr-` bizonyítékot (csak `ok: true`; a vak ítélet kötelező, és csak `IGEN` / `IGEN, FELTÉTELLEL` — `NEM` soha) egy gépi
  `carry-<új fej>` rekorddal. **Az alap mindig a friss `origin/main`** (vak review L1): a szkript maga kéri le, a csúcsát a GitHub
  szerinti `main`-nel egyezteti (eltérés / hiba → nincs átvitel), és a main hash-ét a `carry-` rekordba írja; `--base` kapcsoló
  nincs. **Halmozott PR-láncra nincs átvitel** (a másik szülő egy másik PR ága, nem a main őse → FAIL; a lánc tagjai teljes kört
  kapnak). Az átvitt rekord megőrzi az eredetileg ellenőrzött fejet (`reviewedHead`) és az átvitelek láncát (`carryChain`). **A célfejre már rögzített ítéletet az átvitel soha nem írja felül** (3. vak kör L2: a
  próba előtt és az írás előtt is vizsgálva, kizárólagos létrehozással; a célfejen meglévő `pre-push-` / `pre-pr-` rekord is megmarad).
  Bármely eltérés → nincs átvitel (a teljes kör kell). Az átvitt rekordot a hook a meglévő `ok === true` szabállyal fogadja el.
  **WARN**, ha a main elmozdult, de nincs metszet (pl. csak játékkód változott egy `scripts/qa`-s PR mellett). **PASS**, ha a CI a
  jelenlegi mainnel futott.
- A hook csak a WEBSULI-ból indított Claude Code munkamenetekre hat (a `.claude/settings.json`-t a munkamenet induláskor olvassa —
  a merge után induló munkamenetektől érvényes). Más ügynököt (Codex, Cursor) az `AGENTS.md`, a skillek és a `.cursor/rules` köt.

## Vak, hibakereső ellenőr: körök szabálya (tulajdonosi döntés 2026-11-19: „1 teljes kör + célzott visszanézés”)

- Az **1. kör teljes**: a teljes diff és a terv.
- A **visszanézés** csak a javítást és a korábbi leleteket ellenőrzi (`git diff <régi fej>..<új fej>` + a korábbi lelet-lista).
- A változatlan részben talált **új, NEM blokkoló** lelet **kanban-jegy**, nem új kör.
- Legfeljebb **3 kör**; utána a tulajdonos dönt. **Blokkoló** lelet mindig megállít (javítás + visszanézés).
- A **súlyosságot az ellenőr állapítja meg**; a fejlesztő és az orkesztrátor nem minősítheti le (vita esetén a tulajdonos dönt).
- Jegyre tett lelet mellett az ítélet **„IGEN, FELTÉTELLEL”**, és a jegyszámok a PR-leírásba kerülnek.
- A célzott visszanézés a javítás **hatását a hívóira** is nézi (a módosított függvény / adatszerkezet minden felhasználója), nem csak
  a módosított sorokat.

## Gép-zár (nehéz kör: `npm.cmd ci`, teljes `npm test`, `gate:push` / `gate:pr`, böngészős, DB-konténer)

- Két zár: `<scratchpad>/gep-sav/lock` és `lock2`; a `kovetkezo.txt` sorrendfájl soronként egy nevet tartalmaz. Zárat csak az kérhet,
  akinek a neve a fájlban áll (vagy a fájl üres); a megszerzéskor a SAJÁT sorát törli, a többit meghagyja; a `gazda.txt` a megszerzett
  zár mappájába kerül.
- A zárat csak olyan szkript kérheti, amely a megszerzéskor azonnal fut, időkorláttal megszakít, és `trap`-pel elengedi; egy zárral
  legfeljebb ~30 perc.
- A várakozó szkriptet futás közben nem írjuk felül (új fájlnév); folyamatot csak pontos, saját PID alapján állítunk le, mintaillesztéssel
  soha.

## Push-fegyelem (átmeneti kapu-szabály 5–8., 2026-11-17)

1. Main-merge-et CSAK akkor pusholj, ha a PR ütközik a mainnel, vagy ha az orkesztrátor kéri — a csak-merge push is újraindítja az
   ~1 órás kötelező E2E-t (helyben beolvaszthatod a push előtti kapuhoz).
2. Lecserélt (régi) fej CI-bukására ne reagálj új pushsal: előbb a JELENLEGI fej CI-ja, és hogy a bukó teszt ismert ingadozó-e;
   ingadozás-gyanúnál ne módosíts termékkódot találomra — jelentsd a teszt nevével és a hibaüzenettel.
3. Push után EGY hosszú figyelő a CI végére; közbenső „még fut” jelentés nélkül.
4. Zöld CI-jú fejre csak blokkoló lelet javításáért pusholj — és akkor is mindent egy pushban.

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
- **A gépi összefésült próba (merge-kapu C-61, `gate:carry`) nem teljes CI** (vak review L5): csak node-os teszteket futtat (őrök,
  egység- és `scripts/qa`-tesztek a fenti hatókörrel). **Nem látja:** a böngészős (Playwright E2E) regressziót, a build- / típus- /
  lint-hibát, és a nem egységtesztelt szemantikus ütközést (pl. a main egy hívót módosít, amelyet a PR-tesztek nem érintenek, és
  a teljes egységkör sem fut, mert a két oldal közül csak az egyik nyúlt `source/`-hoz). Ezeket a PR saját CI-ja (a régebbi mainnel)
  és a beolvasztás utáni main-CI fogja meg.
- **A próba PR-kódot futtat a gépen** (vak review L3): a fork-PR kizárva, és előfeltétel a független ítélet + a zöld kötelező
  ellenőrzések; a gyermekfolyamat szűrt környezetet kap (titok-, token-, kulcsnevek nélkül). Maradó kockázat: a PR-kód a felhasználó
  jogaival fut (fájlrendszer, hálózat, a `git` / `gh` hitelesítés a felhasználói profilból elérhető), és a `source/node_modules`
  csomópont-hivatkozáson át a fő checkout függőségeit írhatja. A védelem a független ítélet (a kód elolvasása) a próba előtt.

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
