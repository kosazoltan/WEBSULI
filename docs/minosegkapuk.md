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
- A hook csak a WEBSULI-ból indított Claude Code munkamenetekre hat (a `.claude/settings.json`-t a munkamenet induláskor olvassa —
  a merge után induló munkamenetektől érvényes). Más ügynököt (Codex, Cursor) az `AGENTS.md`, a skillek és a `.cursor/rules` köt.

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

## Teszt-integritás (S1, 2026-11-17; a független review után átdolgozva)

`scripts/qa/gates/test-integrity.mjs` (terv: `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` 6.3a, végrehajtás S1 és R). A
lint-kapu lépéseként fut (szakasz-, push-, PR-kapu) és a CI „Háromfázisú rend” jobjában. **Bevezetési lépcső: mindenütt `warn`** — a
job NEM bukik miatta; a CI a leleteket a job-összefoglalóba írja. A tiltás (`modes.test-integrity.*: block`) feltétele mérve: a nyitott
PR-ok korpuszán ≤ 10% hamis riasztás, ÉS előfeltételként a K1 megoldása: a CI csak pushra fut újra, a PR-leírás szerkesztésére nem
(és a job újraindítása az eredeti esemény leírását kapja — UNVERIFIED), így a „PR-leírás nem sorolja fel” bukás javítása új pusht és
újabb E2E-kört kérne; tiltás előtt a munkafolyamat fusson a leírás szerkesztésére is, vagy a lépés a leírást futásidőben kérdezze le
(terv 6.3a).

- **Két nézet.** (1) DÖNTŐ: a main CSÚCSÁHOZ képesti, összefésült diff (`git merge-tree --write-tree`; a CI-ban a merge-commit) —
  a squash-sel már összevont előzmény-ág commitjait nem rója fel; ez tilthat (majd, `block` módban). (2) KIEGÉSZÍTŐ commit-nézet: csak a
  PR saját commitjai (`--cherry-pick --right-only`) és csak a mainen még NEM létező fájlok — a PR-on belüli lazítás itt látszik (a J7b
  `tornado-sim.test.ts` `withQ >= without - 1` esete); ez SOHA nem tilt. A később visszaállított lazítás és az ugyanarra az alanyra
  megmaradó állítás nem lelet; egy kozmetikai commit (üzenet-átírás) nem tünteti el a leletet (alany + számok szerinti követés).
- **Mérce-szabályok:** törölt tesztfájl / teszteset / állítás (pótlás nélkül), kikommentezett állítás, megváltozott számküszöb /
  relációs jel / várt érték ugyanazon az alanyon (a biztosan szigorúbb irány — és a feltétel ELHAGYÁSA — nem lelet), állítás feltétel
  mögé helyezése ugyanazon a soron, többsoros állítás küszöbe (akkor is, ha csak a belső küszöb-sor változott, a nyitó-sor változatlan
  kontextus), szigorú → laza matcher, megnövelt `timeout` / `retries` (kifejezésben
  is), `.skip(` / `.only(` / `fixme(` / `.todo(` / `test.fail(` / feltételes `skip`, NAGYBETŰS szám-konstans (bot-kalibráció a
  `source/client/src/lib/*/sim.ts`-ben, tűrés a tesztfájlban; csak szám → szám változás — a szám → termékkonstans csere nem). Az
  állítás-párosítás csak azonos hunkon és azonos alanyon belül (az `assert.ok` alanya a teljes bal oldal). Tesztfájl: `*.test|spec.*`, `*.browser.ts`, `*.integration.ts`,
  `source/tests/support/`, `source/tests/game-mobile-cases/`, `source/playwright*.config.ts`.
- **Higiénia-szabályok (mindig csak figyelmeztetés):** új `force: true` / `waitForTimeout(`; új időkorlát / `test.slow()` módosított
  fájlban; forrásfájlt beolvasó teszt (jelölhető `// FORRÁS-ŐR: <indok>`-kal); a kapu saját fájljainak (szkript, konfig, CI)
  változása — a CI a PR saját változatát futtatja, ezért a kapu ugyanabban a PR-ban semlegesíthető (K2): ezt a jelzés hangosítja.
- **Átengedés:** a sorban vagy fölötte ≤ 8 sorban `// SPEC-VÁLTOZÁS <ÉÉÉÉ-HH-NN> (docs/specs/<terv>.md <pont>)`, ÉS a terv vagy
  ugyanebben a diffben változik és a TESZT NEVÉT említi, vagy a FEJEN már megvan és a hivatkozott pont egy CÍMSORÁBAN / LISTAELEMÉBEN /
  táblázatsorában áll (részszöveg nem igazol; a terv a kód előtt, korábbi PR-ban kerül be), ÉS a PR-leírás felsorolja (a teszt neve +
  `SPEC-VÁLTOZÁS`). A fájl fejkommentjében álló jelölés az egész fájlra szól, de CSAK ha ebben a változásban került be. Nem létező
  `--body-file` → a kapu nem fut (kód 2).
- **Kézi futtatás egy másik ág / PR fejére (csak olvas):** `git fetch origin`, majd
  `node scripts/qa/gates/test-integrity.mjs --base origin/main --head origin/<ág> [--body-file <PR-leírás.md>] [--mode block] [--json]`.
  A commit-nézet mindig fut (nincs kapcsolója). Bizonyíték: `test-integrity-<fej>.json`.

### Mit NEM fog meg az S1 (ismert korlátok — „ismert korlát” tesztként is rögzítve)

A független review 31 szándékos lazításából mérve; AST nélkül megbízhatatlan esetekre a kapu NEM találgat:

- állítás **feltétel-BLOKKBA** tétele külön sorokon (`if (…) {` … `}`), **korai visszatérés**, **try/catch** az állítás körül;
- **tautológia** (`assert.equal(42, 42)`), a mért érték helyett a teszt **saját kampójának** állítása;
- **könnyített bemenet** (kevesebb seed, kisebb N, könnyebb adat);
- a tesztfájl **átnevezése nem-teszt névre**, a futtató **fájlmintájának szűkítése**;
- az **eleve rossz mércével érkező új teszt** (pl. a J6a „≤ 1.3” ±10% helyett), és a lazítás, amely EGY commitban születik a fájllal;
- a **matcher-csere** más (nem szigorú → laza) matcherre és a regex-alakú állítás átírása (szerkezeti változás, nem küszöb);
- a tűrés-konstans **másik, nem teszt fájlban** (a `sim.ts` kivételével), és a szám → nem-szám (konstans-hivatkozás) csere;
- a **többsoros állítás**, amelynek nyitó-sora 8 sornál távolabb van a változott belső sortól, vagy amelynek változott sora két
  hunkra esik; a két különböző hunkba került régi / új állítás-alak (áthelyezés + lazítás) — nettó csökkenésnél `assert-removed`.

Ezekre a független ellenőr ellenőrzőlistája marad (a kapu célzottan a felsorolt sorokra irányítja a figyelmét).

## Állítás- és hivatkozás-ellenőrző, láncolt bizonyíték (S2, 2026-11-17; a független review után átdolgozva)

- `node scripts/qa/gates/verify-report.mjs (--report <jelentés.md> | --body-file <md>) [--head <ref>] [--base <ref>] [--no-gh] [--json]`
  — a fej és a bázis a HÍVÓTÓL jön (alapból `HEAD` és `origin/main`). Tételes IGAZ / HAMIS / NEM ELLENŐRIZHETŐ lista; kilépési kód 0 /
  1 / 2 (a 2 = nem futott, bukásnak veendő).
- **Hivatkozás-szabályok (ezt kövesse a jelentés-író is — sablon: `scripts/qa/gates/report-template.md`):**
  - `fájl:sor`, `fájl:sor-sor`, „fájl N. sorában”, `fájl#L<N>`: a fájl és a sor a fejen; a fájl repó-gyökérhez relatív (a `source/`
    előtag elhagyható; egyértelmű utótag / név is elég).
  - **Kódidézet CSAK explicit jelöléssel:** `fájl:sor` → `kód`, vagy `fájl:sor` idézet: `kód` (≥ 8 karakter, ±3 soron belül). A
    hivatkozás utáni próza soha nem idézet.
  - **Más fej:** `<fej>:fájl:sor`, vagy egy `# … fej <hash>` címsor / `- … (fej <hash>) …` lista-elem alatti szöveg — a visszaellenőrzés
    korábbi körei így a SAJÁT fejükön ellenőrzöttek.
  - **Hiány-lelet:** `!fájl` (backtickben) vagy „nem létezik: `fájl`” → IGAZ, ha a fájl tényleg nincs a fejen.
  - **BLOKKOLÓ / MAGAS lelet:** jelölt kódidézet kötelező (leletenként / alcímenként legalább egy `fájl:sor` → `idézet`); hiányában
    figyelmeztetés („idézet nélküli súlyos lelet”).
  - `--report` mellett üres `commands` + `tests` lista és „minden zöld / átment” jellegű próza → figyelmeztetés („nincs igazolt állítás”).
  - A fejen nem létező út **NEM ELLENŐRIZHETŐ** (más ág, munkafa, scratchpad, tervezett fájl), KIVÉVE a teljes, ismert gyökérmappás
    `fájl:sor`-t, amely a repó teljes történetében sem létezik — az HAMIS. Rövidítés-előtag (`WT/`, `L/` …), `…`-os és helyőrzős
    (`<x>`) alak: NEM ELLENŐRIZHETŐ / kihagyva. A NEM ELLENŐRIZHETŐ arány kiíródik; 50% fölött (5+ hivatkozásnál) figyelmeztet
    (`gates.config.json` → `claims.unknownWarnRatio`).
  - `npm run <név>` (mondatvégi írásjel, `-et` / `-t` toldalék levágva), `node scripts/…`, `commit <hash>`, `PR #n`, „N/M teszt” a
    sorban álló bizonyíték-azonosítóval (rövidített azonosító: egyértelmű előtag).
- **Mit NEM ellenőriz az S2:** a hivatkozás melletti ÁLLÍTÁS tartalmát (pl. „a 100. sorban SQL-injekció van”) — csak azt, hogy a
  hivatkozott hely létezik, és explicit idézetnél, hogy a kódrészlet ott áll; a NEM ELLENŐRIZHETŐ hivatkozásokat (más ág, tervezett
  fájl) — ezek aránya kiíródik; a PR / CI állapotát `gh` nélkül.
- **`--report` (alügynök-jelentés) gépi blokk:** kötelező mezők (`schema`, `head`, `branch`, `changedFiles`, `commands`, `tests`, `gates`,
  `notRun` — üres lista is megadandó); a blokk feje = a hívó feje; állapot csak `PASS` / `FAIL` / `NOT RUN`; a PASS bizonyítéka a fejre
  szól, 0 kóddal, és a rögzített parancs = az állított (normalizálva; kapu-rekordnál a kapu-parancs); darabszám-állítás csak rögzített
  darabszámmal; a prózai „N/M teszt” állítás a blokk egy igazolt tételével egyezzen; PR-állapot `gh` nélkül FAIL (`--no-gh`: WARN).
- **Bevezetési lépcső (terv 6.3a):** a `record-review` és (a #490 után) a `gate:pr` a HAMIS hivatkozást `warn` módban csak jelzi
  (az ítélet rögzül, a lista a kimenetben és a rekordban); `modes.claims-verify: block` mellett a rögzítés megtagadva. A váltás
  feltétele: a regressziós korpuszon 0 hamis HAMIS + 10 egymást követő új valódi jelentés hamis riasztás nélkül. A le nem futott
  hivatkozás-ellenőrzés (kivétel) `warn` módban hangos figyelmeztetés a rekordban (`refCheck.ran: false`), `block` módban megtagadás.
- **Lánc-állapot az állításoknál:** az ÁTÍRT rekord (hash-eltérés) mindig bukás; a láncon kívüli / lánc nélküli / `--repair` utáni
  rekord `warn` módban „NEM IGAZOLT” figyelmeztetés (nem PASS — a darabszáma a prózai állítást sem igazolja), `block` módban bukás.
- **Regressziós korpusz (helyi):** `node scripts/qa/gates/verify-report-corpus.mjs --root <scratchpad> [--doc <md>]…` — a valódi
  ellenőri jelentések a scratchpadban maradnak (nyilvános repó); a CI a `verify-report.test.mjs` anonimizált, hibaosztályonkénti
  mintáit futtatja. Mérés 2026-11-17: 13 valódi jelentés + 6 saját doksi → HAMIS 128 → 4; a megmaradt 4 VALÓDI hiba (a #482-es jelentés
  upgrades.ts-re mutató 203–224-es stb. sorszámai a fájl egyetlen változatában sem léteztek; az `effectiveStats` a 129. soron van).
- **A #490 után beillesztendő (egy sor a `pre-pr-gate.mjs`-be, a „PR-leírás sablon” lépés után):**
  `await runReferenceStep({ gate, ctx, text: prTexts[0] ?? '', label: 'PR-leírás' });` (import: `./verify-report.mjs`); és a
  `pre-pr-gate` bizonyíték-írása után `linkRecord(ctx.evDir, 'pre-pr-<fej>')` / `'pre-push-<fej>'` (addig a pre-pr rekord láncon kívüli
  — az ellenőrző ezt csak figyelmezteti).

### A bizonyíték-lánc — mit garantál és mit NEM

`scripts/qa/gates/evidence-chain.mjs`: a tár (`<git-common-dir>/websuli-qa-evidence/`) rekordjai mellé `chain.jsonl` (rekord-hash +
az előző lánc-sor hash-e); a hozzáfűzés kizáró zárfájllal (`chain.lock`, `wx`, benne az író PID-je; korlátos újrapróba 45 s-ig; a 30
s-nál régebbi zár elárvultnak számít és törlődik + napló, DE csak ha a PID már nem él) atomi: 8 párhuzamos író × 200 rekord → 0 törés
(teszt). A rekord vagy a lánc-sor írásának hibája nem csendes: a szakasz- és a push-kapu, a `record-review` hibát ír és nem nulla
kóddal lép ki (a kaput újra kell futtatni); a test-integrity lépés figyelmeztetésre vált. **Felső korlát:** a 40 s-nál öregebb zár
akkor is elvehető, ha a benne álló PID él (a zár alatti művelet ezredmásodperces; ilyen zár csak PID-újrahasznosításból vagy beragadt
idegen folyamatból maradhat) — a `chain-repair.log` ezt külön sorral naplózza.

- **Mit lát az ügynök, mit tegyen:** „a lánc zárja 45000 ms után sem szabadult fel” (kapu: 2-es kód; `--repair`: „NEM FUTOTT: a
  javítás nem sikerült”, 2-es kód) → a zár egy épp dolgozó másik munkafa kapujáé volt; futtasd újra a kaput. Ismétlődésnél nézd meg a
  `chain-repair.log`-ot és a `chain.lock` korát; kézi törlés nem kell (a 40 s-nál öregebb zárat a következő futás átveszi).

- **Garantálja** a véletlen vagy hanyag hamisítás és az utólagos átírás ÉSZLELÉSÉT: kézzel írt, láncon kívüli rekord; átírt rekord;
  kivágott lánc-sor; törölt lánc (`no-chain`, ha van rekord); útvonal-bejárás az azonosítóban (csak `[a-z0-9-]`).
- **NEM véd** egy, a tárat írni tudó, szándékosan csaló ügynök ellen: a teljes lánc újraszámolható. A megkerülhetetlen pont a CI.
- **Bevezetési lépcső:** a lánc-hiba most csak figyelmeztet (`modes.evidence-chain: warn`); tiltás: 2 hét `--verify` törés nélkül.
- **Ellenőrzés / javítás:** `node scripts/qa/gates/evidence-chain.mjs --verify [--json]` (0 ép / 1 törött / 2 nem futott);
  `node scripts/qa/gates/evidence-chain.mjs --repair` — a törött láncot `chain.broken-<időbélyeg>.jsonl` néven archiválja (nem törli),
  új láncot indít a meglévő rekordokból `repair: true` jelöléssel, és a `chain-repair.log`-ba naplóz. **A javítás után a régi rekordok
  NEM igazolt bizonyítékok** (az ellenőrző „NEM IGAZOLT”-at ad rájuk, `block` módban bukást): a javítás után az érintett kapukat
  (szakasz-, push-, PR-kapu, `evidence-run`, `record-review`) újra kell futtatni a friss, láncolt rekordokért.
- `node scripts/qa/gates/evidence-run.mjs -- <parancs>`: futtat és rögzít (`run-<id>`); a parancssorból és a kimenetből a token-alakok,
  a jelszó-kapcsoló, a `NÉV=érték` titok, a JWT és a szolgáltatói kulcs-előtagok szűrve (K5).

## Ingadozó tesztek nyilvántartása (S8, 2026-11-17)

`node scripts/qa/gates/flaky-report.mjs [--limit 20] [--pr <n>] [--json]` — CSAK OLVAS (`gh`). A main utolsó N befejezett CI-futásából
(minden újraindítási kísérlettel; a bukott jobok és a zöld E2E-job naplójával) tesztenként: bukások száma, Playwright-újrapróba
(„flaky”), újraindításra zöldült futás. Besorolás: **ingadozó** (újrapróba / újraindítás / nem egymást követő bukások), **tartós
bukás** (a legfrissebb futásokban egymás után), **egyszeri bukás**. Az azonosító a cím is (`e2e:<spec>:<sor> › <cím>`), mert a
paraméterezett tesztek egy soron élnek.

- `--pr <n> [--attempt <k>]`: a PR fejének legutóbbi (vagy a k.) CI-kísérletében bukott tesztekről ad **JAVASLATOT**. **Az ítélet csak
  javaslat a bukott job újrafuttatására; NEM pótolja a zöld futást — merge csak zöld kötelező ellenőrzésekkel.**
  - **„nem a PR hibája”** — csak ha MINDEN bukott teszt a `known-flaky.json` `tests` listáján van, kanban-jeggyel és le nem járt
    `reviewBy` dátummal, a mainen nem „tartós bukás”, ÉS a PR nem módosította sem a tesztfájlt, sem a teszt területét, ÉS a bukás nem
    ismétlődik a PR több kísérletében.
  - **„a PR hibája lehet”** (kód 1) minden más esetben: listán kívüli teszt (a main rangsorában ingadozónak látszó is: „ingadozó-gyanú,
    jegy kell”), az `exclude` listán álló (regresszió-gyanús) teszt — pl. a #106-os block-craft eset —, „tartós bukás”, lejárt vagy
    hiányzó `reviewBy`, jegy nélküli elem, **érintett terület (fail-closed)**: felmentés csak akkor, ha a PR egyáltalán nem érint
    termékkódot (csak `docs/`, `scripts/qa/`, gyökér `*.md`, tesztfájlok — a bukó tesztfájl kivételével), vagy MINDEN termékkód-
    változása EGYÉRTELMŰEN egy MÁSIK játék saját területe (`gates.config.json` `gameOwnRoots` — a játék lapja, `lib/<játék>/` — és a
    `games` minta pontosan egy, a tesztétől eltérő játékra illik). Minden más — a teszt saját játéka, közös hook / komponens,
    `shared/`, szerver, séma, útvonal, build- és függőség-konfig, `package.json`, `index.css`, CI, ismeretlen besorolású fájl,
    azonosítatlan tesztterület termékkód mellett — „a PR hibája lehet — közös / ismeretlen terület”.
  - **„nem értelmezhető bukás”** (kód 1): piros kísérlet, de a naplóból egyetlen tesztnév sem olvasható ki (build-, telepítés-,
    időtúllépés-hiba) — kézi vizsgálat kell, nem „nincs bukás”.
  - Ez a push-fegyelem 2. pontjának gépi támasza: ismert ingadozó bukásra nem reagálunk termékkód-pushsal, de a döntést a zöld
    újrafuttatás zárja le.
- `scripts/qa/gates/known-flaky.json`: `tests` — minden elemhez kötelező a kanban-jegy (`ticket`) és a felülvizsgálati dátum
  (`reviewBy`, ÉÉÉÉ-HH-NN; lejárta után az elem nem ment fel, a riport `FAIL`); `exclude` — a soha fel nem mentendő tesztek (jeggyel,
  indokkal). A jegy nélküli / lejárt / listán kívüli ingadozó a riportban `FAIL` (kód 1).
- A letöltött job-naplók a bizonyíték-tár `ci-logs/` mappájába kerülnek (futás + kísérlet + job szerint változatlanok).

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

## Ellenpróbák (2026-11-17, a bevezető PR-ban)

A bevezető PR leírása tartalmazza a parancsokat és a kimenet lényegét: lint-hiba → `lint-gate --fast` FAIL; bukó egységteszt →
`stage-gate` FAIL; végrehajtási fájl nélküli kód → `pre-push-gate` FAIL (háromfázisú rend); hiányzó ítélet → `pre-pr-gate` FAIL;
nyitott review-szál → `pre-merge-gate` FAIL (egységteszt); bizonyíték nélküli `git push` → hook DENY.
