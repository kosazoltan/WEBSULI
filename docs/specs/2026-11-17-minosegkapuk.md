# Spec: Minőségkapuk — lint kapu, szakasz-kapu, push / PR / merge előtti kapu, független fejlesztési ellenőr

> Dátum: 2026-11-17 · Szerző: Claude Code (alügynök, tulajdonosi utasításra) · Állapot: JÓVÁHAGYVA (a tulajdonos kifejezett,
> kötelező érvényű utasítása 2026-11-17)
> Végrehajtás: `docs/specs/2026-11-17-minosegkapuk-vegrehajtas.md`

## 0. A tulajdonos utasítása (2026-11-17, szó szerint)

„A kötelező érvényű utasítás, mentsd el a repóban. Először is bármilyen kibocsátás előtt végig futtasd a saját lint kaput. Másrészt
pedig minden fejlesztés után automatikusan egy független alügynök ellenőrizze az elkészült fejlesztést, hogy ne utólag derüljenek ki a
hibák és kelljen az egészet újraírni. Készíts belőle skillt: fejlesztési ellenőr, lint ellenőr, PR előtti kapu, push előtti kapu, merge
előtti kapu — helyi szkriptekkel dolgozd ki az ellenőrzés menetét mindegyik skillben. Ne az API-költséget növeld az állandó hibával,
hanem minden egyes szakasz után a helyi gyors szkript-ellenőrzések és tesztek fussanak le, és csak utána lépj tovább, ha ezeket
javítottad.”

## 1. Cél

A 2026-11-16/17-i játékhullám öt PR-jából négynél a független review a ZÖLD CI UTÁN talált blokkoló hibát; minden ilyen kör 1–1,5 óra
CI-t és egy újabb review-kört költött (`docs/handoffs/2026-11-17-jatekok-utomunka-retro.md`, `docs/agent-csapdak.md` C-61…C-72).
A cél: (1) olcsó, helyi, determinisztikus kapuk minden fejlesztési szakasz után és minden kibocsátás előtt; (2) a független alügynökös
ellenőrzés kötelező, rögzített menettel és a mért hibatípusokból álló ellenőrzőlistával — a PR megnyitása ELŐTT; (3) a kapuk
kikényszerítése harness-szinten (PreToolUse hook), ahol ez olcsó.

## 2. NEM cél

- A `source/` alatti alkalmazáskód módosítása (ez eszköz-PR). Ha a kapuk valódi alkalmazáshibát találnak, jelentjük, nem javítjuk.
- A CI kötelező ellenőrzéseinek vagy a főág védelmének módosítása (`gh api …/protection` — tulajdonosi hatáskör).
- Vészkijárat / felülbírálási kapcsoló a kapukhoz. Hibás kapunál a kaput kell javítani.
- A meglévő hookok (`check-audit-ok`, `check-destructive`, `enforce-repo-rules`, `warn-test-edit`) viselkedésének változtatása.
- Git-hookok (`.git/hooks`, husky) bevezetése: a kikényszerítés a Claude Code PreToolUse láncon fut, a `--no-verify` így nem is értelmezhető
  megkerülés.

## 3. Érintett területek

Új:
- `scripts/qa/gates/lib.mjs` — közös futtató (lépésenkénti kilépési kód, összesítő tábla, kimenet-szűrés), git-segédek, bizonyíték-tár.
- `scripts/qa/gates/gates.config.json` — konfigurálható listák (közös / tiltott fájlok, szelet-módú közös modulok, játék-kulcsszavak,
  tükrözött skillek, határidők).
- `scripts/qa/gates/lint-gate.mjs`, `stage-gate.mjs`, `pre-push-gate.mjs`, `pre-pr-gate.mjs`, `pre-merge-gate.mjs`,
  `record-review.mjs`, `skills-sync-check.mjs` + mindegyikhez `*.test.mjs` (`node --test`).
- `scripts/qa/hooks/check-quality-gates.mjs` + `scripts/qa/hooks/check-quality-gates.test.mjs`.
- `.agents/skills/websuli-{lint-ellenor,fejlesztesi-ellenor,push-elotti-kapu,pr-elotti-kapu,merge-elotti-kapu}/SKILL.md` (forrás) és
  ugyanezek a `.claude/skills/` alatt (bájtazonos tükör, a `skills-sync-check` őrzi).
- `docs/minosegkapuk.md` (runbook), `.cursor/rules/minosegkapuk.mdc`.

Módosul:
- `AGENTS.md` (új szakasz a kezelt blokkon kívül), `docs/agent-haromfazisu-munka.md`, `docs/telepites-elotti-or.md` (egy-egy mondat),
  `.claude/settings.json` (új hook-bejegyzések), `package.json` (gyökér: `gate:*` belépők), `.gitignore`,
  `.github/workflows/ci.yml` (a kapuk saját tesztjei és a skill-tükör ellenőrzése a „Háromfázisú rend” jobban).

## 4. Rögzített döntések és kényszerek

- **D1 — Nyelv és futtató:** Node ESM `.mjs`, külső függőség nélkül; `child_process.spawnSync` argumentumtömbbel. Windows-on az `npm`
  hívás `npm.cmd`-vel (a `.cmd` futtatásához a Node ≥ 20 `shell: true`-t követel — csak a saját, rögzített argumentumainkkal); a node-os
  eszközök (eslint, tsc, tsx-tesztek) közvetlenül `process.execPath`-szal, shell nélkül. Architektúra-független (x64, ARM64, Linux).
- **D2 — Lépés-modell:** minden lépés külön kilépési kóddal fut; állapotok: `PASS`, `FAIL`, `WARN`, `SKIP` (nem alkalmazható / eszköz
  hiányzik, okkal), `NOT RUN` (alkalmazható volna, de nem futtatható — okkal), `KIVÉTEL` (névvel jelölt ismert helyi kivétel). A végén
  összesítő tábla; a kilépési kód 1, ha bármely lépés `FAIL` (vagy `--strict` mellett `NOT RUN`).
- **D3 — Kimenet-szűrés:** a gyermekfolyamatok kimenetét a kapu elnyeli, és csak bukáskor, az utolsó ~40 sort írja ki, szűrve
  (e-mail-alak, `postgres://…`, ismert token-előtagok, `Bearer …` → helyőrző). Teljes (szűrt) napló a bizonyíték-tár `logs/` mappájába.
- **D4 — Bizonyíték-tár helye:** `$(git rev-parse --git-common-dir)/websuli-qa-evidence/` (felülírható: `WEBSULI_QA_EVIDENCE_DIR`).
  Indok: a közös git-könyvtárat a fő checkout és minden munkafa ugyanúgy látja, a fájlok fej-hash szerint kulcsoltak, így a munkafában
  futtatott kapu bizonyítékát a fő checkoutból kiadott parancs hookja is megtalálja; és a git-könyvtár tartalma nem commitolható. A
  `.gitignore` mégis kap egy `qa-evidence/` és `.qa-evidence/` sort (ha valaki a felülírással a munkafába tenné).
- **D5 — Bizonyíték-fájlok:** `pre-push-<fej>.json`, `pre-pr-<fej>.json`, `merge-<PR>-<fej>.json`, `review-<fej>.json`; mezők:
  `kind`, `head` (40 jegyű), `ok`, `at` (ISO), `steps` (név + állapot), a review-nál `verdict`, `report`, `reportSha256`. Titok nincs benne.
- **D6 — A hook csak olvas:** `check-quality-gates.mjs` a bizonyíték-fájlt nézi (és a merge-nél a PR fejét a `gh`-tól), nem futtat kaput.
  Csak akkor lép életbe, ha a cél-repóban létezik `scripts/qa/gates/pre-push-gate.mjs` (más repóba pusholást nem érint). Hibánál /
  ismeretlen állapotnál a push / PR / merge esetén **DENY** (szigorúbb ág), minden más parancsnál nincs kimenet.
- **D7 — Mit enged a hook vizsgálat nélkül:** `git push --delete` / `-d` / `:ág` (távoli ág törlése), `git push --dry-run`, minden nem
  push / nem `gh pr create` / nem `gh pr merge` parancs, és a nem WEBSULI-repó.
- **D8 — Merge-bizonyíték érvényessége:** a `merge-<PR>-<fej>.json` legfeljebb 15 percig érvényes (a futásőr „közvetlenül előtte”
  szabálya, `docs/telepites-elotti-or.md`), és csak ha a fej egyezik a PR aktuális fejével. A push / PR bizonyíték fej-hash szerint
  érvényes (a frissességet a meglévő `.audit-ok` hook adja).
- **D9 — Független ellenőr ítélete:** a `record-review.mjs` írja (`review-<fej>.json`), és kiírja a PR-leírásba / kommentbe illeszthető
  sort: `Független ellenőr ítélete: IGEN (fej: <hash>)`. A `pre-pr-gate` és a `pre-merge-gate` a bizonyíték-fájlt VAGY ezt a sort
  (PR-leírás, PR-komment) fogadja el; a fej-hash (≥ 7 jegy) előtag-egyezéssel. `IGEN` és `IGEN, FELTÉTELLEL` átenged (az utóbbi
  `WARN`-nal: a feltételek jegyre menjenek), `NEM` vagy hiány bukás. A nyilvános repó miatt a PR-ra csak az ítélet és a fej-hash kerül.
- **D10 — Ismert helyi kivétel (C-38):** a `native-arch.test.ts` bukása `KIVÉTEL`, ha (a) a teljes tesztfutásban CSAK ez a fájl bukik,
  ÉS (b) a `npm run doctor:arch` is bukik (ugyanaz a környezeti ok). A CI `native-arch` jobja ezt a tesztet x64-en és ARM64-en futtatja.
  Bármely más bukás mellett, vagy ha a `doctor:arch` zöld, a `native-arch` bukása `FAIL`.
- **D11 — CI-azonos böngészős út (pre-pr):** a kapu egy gitignore-olt csomagoló konfigot ír (`source/playwright.gate.local.mts`, a
  `*.local.mts` minta már ignorált), amely a `playwright.config.ts`-t terjeszti ki: szoftveres WebGL (`--use-angle=swiftshader`,
  `--enable-unsafe-swiftshader`), `workers: 1`, `forbidOnly: true`; a futás a meglévő `scripts/run-e2e-tests.ts` harnesszel megy
  (eldobható Postgres 17, migráció, seed, a buildelt szerver saját szabad porton: `WEBSULI_E2E_PORT`). A `retries` 0 marad (szigorúbb a
  CI 2-esénél). Docker nélkül a kötelező e2e `NOT RUN` → `FAIL` (a kötelező böngészős út nem hagyható ki csendben).
- **D12 — Gyors mód célja:** `lint-gate --fast` < 60 s ezen a gépen; ha a teljes `tsc` ezt túllépi, a gyors mód a `tsc`-t csak akkor
  futtatja, ha változott `.ts/.tsx` a `source/` alatt (és a tesztfájl-típusellenőrzést csak változott tesztfájlnál). A mért időket a
  runbook rögzíti.
- **D13 — Skill-tükrözés:** a forrás a `.agents/skills/<név>/SKILL.md`; a `.claude/skills/<név>/SKILL.md` bájtazonos másolat (a
  Claude Code a saját helyén keresi a teljes skillt — egy rövid átirányító elveszítené a tartalmat). A `skills-sync-check.mjs` bukik
  eltérésnél (CI-ban is), `--fix` a forrásból másol.
- **D14 — Nincs vészkijárat:** egyik kapu és a hook sem fogad „kihagyás” kapcsolót; a `--strict` csak szigorít.

## 5. Edge case-ek

- Munkafa vs. fő checkout: a hook a parancs célkönyvtárát a `git -C <út>`, a parancs elején álló `cd <út> &&`, különben a hook-bemenet
  `cwd` mezője alapján határozza meg; a bizonyíték a közös git-könyvtárban van → mindkét helyről ugyanaz.
- Commitolatlan változás push előtt: a `pre-push-gate` bukik (a bizonyíték a fej-commitra szól, piszkos fán nem igazolható).
- Nem követett fájl: figyelmeztetés (az e-mail-őr a `git ls-files`-t nézi — a nem követett fájlt nem látja).
- Nincs `gh` / nincs hálózat: a „zöld CI utáni push” figyelmeztetés `SKIP`; a merge-kapu viszont bukik (hálózati hiba = bukás).
- Nincs Docker: a DB-teszt `NOT RUN` (`--strict` → bukás), a kötelező e2e `NOT RUN` → bukás.
- A friss `origin/main` nincs beolvasztva: az őr-tesztek az összefésült állapoton futnak egy ideiglenes, leválasztott munkafában
  (`node_modules` csomópont-hivatkozással); ütközésnél bukás „olvaszd be a maint” üzenettel.
- Több parancs egy sorban (`git add … && git commit … && git push`): a hook FAIL-CLOSED — kapu-köteles művelet csak önálló,
  egyszerű parancsként engedett (a #489 bot-leletei után; `docs/minosegkapuk.md`). Önálló, nem futtató eszközben (`echo`, `grep`, `rg`)
  az idézett „git push” szöveg nem számít; láncolt parancsban vagy futtató eszközben (`bash -c`, `iex` …) DENY.
- `gh pr merge` szám nélkül: a PR-t az aktuális ágról olvassa a `gh`.
- Merge-bizonyíték lejárt (> 15 perc) vagy más fejre szól: DENY.
- Szándékos hibák (ellenpróbák): lint-hiba, bukó egységteszt, hiányzó végrehajtási fájl, nyitott review-szál, hiányzó ítélet — mind
  bukást és érthető magyar üzenetet ad.

## 6. Elfogadási kritériumok (EARS)

- E1 WHEN a `lint-gate --fast` fut egy lint-hibás változott fájllal THEN the gate SHALL `FAIL`-t adni az ESLint lépésre és 1-gyel kilépni.
- E2 WHEN a `lint-gate --full` fut tiszta ágon THEN the gate SHALL lefuttatni: `git diff --check`, változott-fájl ESLint, teljes
  `npm run lint`, `npm run check`, `npm run check:test`, a repó-szabály ellenőrzést a diffre, a tiltott minták keresését és a
  `no-real-emails-guard` tesztet, mindet külön lépésként.
- E3 WHEN a diff tesztfájlban `.only(` / `.skip(`, szkriptben `--no-verify` git-kapcsolót, vagy titok-mintát (privát kulcs, AWS-kulcs,
  ismert token-előtag, jelszavas nem-loopback adatbázis-URL) hoz THEN the gate SHALL `FAIL`-t adni fájl:sor hivatkozással, az érték
  kiírása nélkül.
- E4 WHEN a `stage-gate` fut THEN it SHALL a `lint-gate --fast` lépései után a változott `source/**` fájlokhoz leképezett egységteszteket
  (névtő, import-keresés, játék-csoport) és minden `*-guard.test.ts`-t egy futásban lefuttatni, és figyelmeztetni minden olyan változott
  fájlra, amelyhez nincs célzott teszt.
- E5 WHEN a `pre-push-gate` fut THEN it SHALL a `lint-gate --full`, a teljes egységteszt (D10 kivétellel), a háromfázisú ellenőrzés, a
  PR-méret, a friss `origin/main` beolvasztottsága (ha nem: őr-tesztek az összefésült állapoton), a közös fájlok érintése, a `.audit-ok`
  frissessége és a „zöld CI utáni push” lépést futtatni, és zöld esetben `pre-push-<fej>.json` bizonyítékot írni.
- E6 WHEN a `native-arch.test.ts` az egyetlen bukó tesztfájl ÉS a `doctor:arch` is bukik THEN the gate SHALL `KIVÉTEL`-t jelezni névvel;
  WHEN más tesztfájl is bukik vagy a `doctor:arch` zöld THEN `FAIL`.
- E7 WHEN a `pre-pr-gate` fut THEN it SHALL a pre-push lépései mellett `npm run build`-et, játék- / UI-változásnál a CI-azonos böngészős
  utat (D11), DB-változásnál a `test:learning-db`-t (Docker), a PR-leírás sablon-ellenőrzését és a független ellenőr ítéletét ellenőrizni,
  és zöld esetben `pre-pr-<fej>.json`-t ÉS `pre-push-<fej>.json`-t írni.
- E8 WHEN nincs `IGEN` / `IGEN, FELTÉTELLEL` ítélet az aktuális fejre THEN the `pre-pr-gate` és a `pre-merge-gate` SHALL bukni.
- E9 WHEN a `pre-merge-gate <PR>` fut THEN it SHALL ellenőrizni: nyitott, nem piszkozat, `CLEAN`; minden kötelező ellenőrzés (a
  főág-védelemből) sikeres a JELENLEGI fej check-runjai között; 0 lezáratlan review-szál; a main elmozdulása + őr-/repó-szintű fájl →
  bukás; ítélet a fejre; a futásőr kilépési kódja 0; `source/` érintésnél „telepítést indít” jelzés; `/api/rt/status`: `mode` off vagy
  `activeMatches` = 0, hálózati hiba = bukás. A `gh pr merge`-et NEM hívja.
- E10 WHEN egy ügynök `git push`-t ad ki a WEBSULI-repóban, és nincs zöld `pre-push-<HEAD>` (vagy `pre-pr-<HEAD>`) bizonyíték THEN the
  hook SHALL DENY-t adni magyar üzenettel (`npm run gate:push`); WHEN a parancs távoli ág törlése THEN SHALL engedni.
- E11 WHEN `gh pr create` fut zöld `pre-pr-<HEAD>` nélkül, vagy `gh pr merge <n>` fut ≤ 15 perces, a PR aktuális fejére szóló zöld
  `merge-<n>-<fej>` nélkül THEN the hook SHALL DENY-t adni.
- E12 WHEN a hookot a fő checkoutból vagy egy munkafából hívják THEN SHALL ugyanazt a bizonyítékot találni (közös git-könyvtár).
- E13 WHEN a `.agents/skills` és a `.claude/skills` alatti tükrözött `SKILL.md` eltér THEN the `skills-sync-check` SHALL bukni (CI-ban is).
- E14 WHEN a CI „Háromfázisú rend” jobja fut THEN SHALL a `scripts/qa/gates/*.test.mjs` és a `scripts/qa/hooks/*.test.mjs` teszteket és a
  skill-tükör ellenőrzést is futtatni.
- E15 WHEN bármely kapu kimenetet ír THEN abban e-mail-cím, kapcsolati szöveg vagy token nem jelenhet meg (szűrő + teszt).

## 7. Tesztterv

- `scripts/qa/gates/lib.test.mjs` — futtató, összesítő, kilépési kód, szűrő (E15), bizonyíték-tár írás / olvasás.
- `scripts/qa/gates/lint-gate.test.mjs` — tiltott minták és titok-minták a diff hozzáadott soraiban (E3), lépéslista gyors / teljes módban
  injektált futtatóval (E1, E2).
- `scripts/qa/gates/stage-gate.test.mjs` — leképezés (névtő, import, játék-csoport, nincs teszt → figyelmeztetés) (E4).
- `scripts/qa/gates/pre-push-gate.test.mjs` — `native-arch` kivétel döntése (E6), TAP-elemzés, közös fájl, `.audit-ok`, zöld-CI figyelmeztetés.
- `scripts/qa/gates/pre-pr-gate.test.mjs` — UI / játék / DB-felismerés, spec-kiválasztás, PR-leírás sablon, ítélet-feloldás (E7, E8).
- `scripts/qa/gates/pre-merge-gate.test.mjs` — döntés hamis `gh` / futásőr / rt-válaszokkal (E9).
- `scripts/qa/gates/record-review.test.mjs`, `skills-sync-check.test.mjs` (E13).
- `scripts/qa/hooks/check-quality-gates.test.mjs` — ideiglenes git-repó + munkafa, bizonyíték a közös git-könyvtárban (E10–E12).
- Valódi próba a saját ágon: mind az öt kapu, ellenpróbákkal; az eredmények a runbookban és a PR-leírásban.

## 8. Kockázatok / visszavonási terv

- Hibás hook blokkolhatja a pusht / PR-t / merge-et: a hook egységtesztje mindhárom ágat és a törlés-kivételt méri; visszavonás:
  a `.claude/settings.json` hook-bejegyzésének eltávolítása (egy revert-commit).
- A teljes kapu lassú (a teljes `npm test` több perc): a szakaszonkénti használatra a `--fast` / `stage-gate` való; a lassú kapuk csak
  kibocsátás előtt futnak.
- A CI-azonos böngészős út Docker nélkül nem fut: a kapu ezt bukásként jelzi, nem csendben.
- A hook csak az ebből a repóból indított Claude Code munkamenetekre hat; más ügynököt (Codex, Cursor) a skill és az `AGENTS.md` köt.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-17-minosegkapuk-vegrehajtas.md`
