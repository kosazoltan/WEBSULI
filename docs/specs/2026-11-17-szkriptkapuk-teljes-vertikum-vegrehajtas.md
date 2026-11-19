# Végrehajtás: Szkript-ellenőrző kapuk a teljes vertikumra (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` · Kanban: #91
> Munkafa: `.claude/worktrees/szkriptkapuk`. A kidolgozó lánc (`chore/kapu-ingadozo`, fej `f98dfc42`; benne `docs/szkriptkapuk-terv`,
> `chore/kapu-teszt-integritas`, `chore/kapu-allitas-ellenor`) PR nélkül áll — a főágra a lenti P1–P5 szeletekben kerül, friss ágakon.
> **Állapot (2026-11-18):** S0, S1, S2, S8 a kidolgozó láncban kész; a független ellenőr harmadik köre (`0a4548b3`): IGEN, FELTÉTELLEL
> (F1, F2 javítva: `f98dfc42`). P1 (a terv) kész, PR-ra vár · P2 folyamatban · P3–P5 a lenti sorrendben · S3, S5, S6, S7 kiadható megbízás (lent) ·
> S4 az összevonások után.

## Szeletelés a főágra (orkesztrátori döntés 2026-11-18, „A” opció)

A kidolgozó lánc +4316 sor; a főágra kisebb, egymásra épülő PR-okban kerül, a három őr-érintő PR (CI-szeletelés,
`chore/hook-onfailure-tilt`, `chore/vak-hibakereso-ellenor`) UTÁN. Minden szelet friss ág az `origin/main`-ről; a fájlok a kidolgozó
láncból kerülnek át (nem beolvasztással), és minden szelet saját terv-commitja ezt a fájlt frissíti (állapotsor + a szelet pontja), így
a háromfázisú ellenőr minden PR-ban látja a végrehajtási utasítást.

| Szelet | Ág | Tartalom | Előfeltétel |
|---|---|---|---|
| P1 | `chore/szkriptkapuk-p1-terv` | a terv és ez a végrehajtási fájl (csak doksi) | — |
| P2 | `chore/szkriptkapuk-p2-bizonyitek-lanc` | `scripts/qa/gates/evidence-chain.mjs` (+ teszt), `evidence-run.mjs`; a titok-szűrés bővítése a `lib.mjs` `redact`-jában; a szakasz- és a push-kapu láncolt rekordja hangos hibával; runbook-szakasz | P1 (a terv-commit elöl), és a terv sorrendje szerint a #506 (`chore/hook-onfailure-tilt`) és a #513 (`fix/merge-kapu-rest`) összevonása után |
| P3a | `chore/szkriptkapuk-p3a-teszt-integritas` | `test-integrity.mjs` diff-értelmező és mérce-szabályok + tesztjeik | P2 bent |
| P3b | `chore/szkriptkapuk-p3b-teszt-integritas-kapu` | jelölés-igazolás, nézetek, CLI, lint-kapu lépés, CI-lépés (`warn`), `gates.config.json` `testIntegrity` / `modes`, runbook | P3a bent |
| P4a | `chore/szkriptkapuk-p4a-hivatkozas` | `verify-report.mjs` hivatkozás-ellenőrzés, korpusz-futtató, sablon, tesztjeik | P2 bent |
| P4b | `chore/szkriptkapuk-p4b-allitasblokk` | a gépi blokk (`--report`), a `record-review` bekötése a vak-ellenőr `checkReport`-ja UTÁN, a `gate:pr` egy sora, skill | P4a + a vak-ellenőr ág bent |
| P5 | `chore/szkriptkapuk-p5-ingadozo` | `flaky-report.mjs` (+ teszt) a szeletelt CI job-neveihez és riporteréhez igazítva, `known-flaky.json` újramérve, `gameOwnRoots` | P2 + a CI-szeletelés bent |

Szeletenként: `npm run gate:stage` → `npm run gate:push` → független (vak, hibakereső) ellenőr + `record-review` → `gate:pr` → push +
PR → zöld CI → `gate:merge`. A kidolgozó lánc ágai a P5 összevonásáig megmaradnak (utána törlésre jelölve).

### P2 — láncolt bizonyíték (végrehajtás)

Terv: `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` (6.1 láncolt bizonyíték, 6.3a bevezetési lépcső). Ág:
`chore/szkriptkapuk-p2-bizonyitek-lanc` (a P1 commitjára épül; a P1 összevonása után a főág beolvasztása).

1. Új fájlok a kidolgozó láncból (`chore/kapu-ingadozo`, `f98dfc42`): `scripts/qa/gates/evidence-chain.mjs`,
   `scripts/qa/gates/evidence-chain.test.mjs`, `scripts/qa/gates/evidence-run.mjs`; új `scripts/qa/gates/evidence-run.test.mjs` (a
   kidolgozó láncban a `verify-report.test.mjs` része volt).
2. A K5 titok-minták (jelszó-kapcsoló, `NÉV=érték` titok, JWT, kulcs-előtagok) a `scripts/qa/gates/lib.mjs` `REDACTIONS` listájába
   költöznek (a #490 óta a `lib.mjs` módosítható); az `evidence-run` a `lib.redact`-ot használja, a külön `redactMore` megszűnik.
3. `scripts/qa/gates/stage-gate.mjs`: `stage-<fej>` láncolt rekord; írási hibánál hiba + nem nulla kód.
   `scripts/qa/gates/pre-push-gate.mjs`: a `pre-push-<fej>` rekord láncba kötése; hibánál a rekord `ok: false`-ra íródik (a független
   review K-f tétele: a zöld bizonyíték nem maradhat zöld), hiba + nem nulla kód.
4. `docs/minosegkapuk.md`: „Láncolt bizonyíték” szakasz (zár, teendő, nem csendes hiba, mit garantál / mit nem, `--verify` /
   `--repair`, `evidence-run`).
5. Nem része: a `test-integrity` / `verify-report` / `record-review` rekordjai (P3, P4), a `modes.evidence-chain` kapcsoló (P4).
6. Ellenőrzés: `node --test scripts/qa/gates/evidence-chain.test.mjs scripts/qa/gates/evidence-run.test.mjs scripts/qa/gates/lib.test.mjs`;
   `npm run gate:stage`; mutációs ellenpróba a zár-ágakra és a K-f ágra (másolaton); 22:15 UTC után `npm run gate:push`.

### P2 — javítókör a vak, hibakereső ellenőrzés után (2026-11-19; ítélet a `febee69c` fejre: IGEN, FELTÉTELLEL)

Terv: `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` 6.1. Minden pont előbb bukó teszttel.

7. P2-K1: a `--verify` (`verifyChain`) a láncba író kapuk rekordjai (`stage-`, `pre-push-`, `run-`) közül jelzi a láncon kívülit (a
   lánc indulása után írtat; a korábbiak „régi” jelzést kapnak) és a rekordok melletti hiányzó láncot — nem „ÉP” 0-s kóddal.
8. P2-K2: az `evidence-run` `dirty` mezője a nem követett fájlokat is számolja (`dirtyOf`; a push-kapu J7-tel egyezően).
9. P2-K3: a `--repair` ép láncon nem fut (csak `--force`-szal); az újra-láncolt rekord állapota `repaired-unverified`, nem `ok`.
10. P2-K4: a push-kapu rekordja `appendRecord`-dal íródik (zár alatt, ideiglenes néven, a lánc-sor után kapja a végleges nevét);
    láncolatlan zöld rekord leállt folyamatból sem marad; a `main()` mindig a `finalizeEvidence` kódjával lép ki.
11. P2-K5: az elárvult zár átvétele atomi (átnevezés + tartalom-ellenőrzés + `link`-es visszaállítás); a `finally` csak a saját
    (egyedi tokenes) zárát törli.
12. P2-K7: `testCounts` az UTOLSÓ összesítőt veszi; a `realExec` Windows-on a `.cmd` / `.bat` parancsot (pl. `npm.cmd`) shellen át
    indítja; a titok-szűrés kis- és vegyes betűs `név=érték` és `név: érték` alakra is.
13. P2-K8: tesztek a túlélő mutánsokra (`finalizeStage`, `finalizeEvidence` kódja, `verifyChain` hash-ellenőrzés, `dirtyOf`).
14. P2-KI5: a csapda-katalógus bejegyzése C-76 (a #506 a C-75-öt hozza; a később beolvasztott kap új számot).
15. Ellenőrzés: célzott tesztek, mutációs ellenpróba (másolaton); szakasz- és push-kapu az ütemezett ablakon kívül.

## R — Javítókör a független review után (2026-11-17; jelentés: a scratchpad `review-szkriptkapuk/jelentes.md`)

Elv: a terv 6.3a „Bevezetési lépcsők” szakasza szerint MINDEN új kapu `warn` alapértékkel indul; a tiltás konfig-kapcsoló, alapból KI.

1. **S2 hivatkozás-ellenőrző (B1, K6, K7):** kódidézet CSAK explicit jelöléssel (`fájl:sor` → `kód`, vagy `fájl:sor` idézet: `kód`);
   szakasz-fej (`# … fej <hash>`) és explicit `<fej>:fájl:sor` szintaxis — a hivatkozás a saját fején ellenőrzött; a fejen nem létező
   út NEM ELLENŐRIZHETŐ, kivéve a teljes (ismert gyökérmappás) `fájl:sor` hivatkozást, amely a repó TELJES történetében sem létezik
   (az HAMIS); negatív hivatkozás (`!fájl` vagy „nem létezik:” előtag) → IGAZ, ha tényleg nincs; rövidítés-előtag (`WT/`, `L/` …),
   `…`-os és helyőrzős (`<x>`) alak kihagyva / NEM ELLENŐRIZHETŐ; `npm run` név végi írásjel és toldalék levágva; tilde-kerítés;
   „fájl N. sorában” és `fájl#L<N>` alak kigyűjtve; a NEM ELLENŐRIZHETŐ arány kiírva, küszöb fölött figyelmeztet
   (`gates.config.json` → `claims.unknownWarnRatio`).
2. **Regressziós korpusz (B1/1):** `scripts/qa/gates/verify-report-corpus.mjs --root <scratchpad> [--doc <md>]` (helyi, útvonal-
   paraméteres; a jelentések NEM kerülnek a repóba); a CI-ban hibaosztályonként egy-egy anonimizált minta a `verify-report.test.mjs`-ben.
   Cél: 0 hamis HAMIS a korpuszon, a hamisított változatok (nem létező sor / fájl, hamis idézet, nem létező szkript, „30/30” 29
   mellett) továbbra is buknak.
3. **Bevezetés (B1/5):** `record-review` és `gate:pr`: `modes.claims-verify` (`warn` alapból) — WARN + tételes lista, az ítélet rögzül.
4. **`--report` szigorítás (M1):** a fej és a bázis a hívótól jön (`--head`, `--base`), a blokk feje egyezzen; kötelező mezők; zárt
   állapot-szótár (PASS / FAIL / NOT RUN); a rekord parancsa = az állított parancs (normalizálva) és a fej; a prózai „N/M teszt”
   blokk-megfelelő nélkül bukás; minden kijátszás negatív teszt.
5. **Lánc (M2, M3):** azonosító-szűrés (`[a-z0-9-]`); láncon kívüli rekord érvénytelen; hiányzó lánc ≠ üres lánc; atomi hozzáfűzés
   kizáró zárfájllal (`wx`), korlátos újrapróbával, elárvult zár kezelésével; teszt 8 párhuzamos író × 200 rekord; `evidence-chain.mjs
   --verify` és `--repair` (archivál + naplóz, nem simít); a lánc-ellenőrzés `modes.evidence-chain` szerint (`warn` alapból); a runbook
   őszintén leírja, mit véd és mit nem.
6. **S1 (B2, M4):** a CI-ban `warn` + job-összefoglaló (`$GITHUB_STEP_SUMMARY`); a döntő nézet a main CSÚCSÁHOZ képesti, összefésült
   diff (`git merge-tree --write-tree`), a commit-nézet csak a mainen még nem létező fájlokra fut és soha nem tilt; a SPEC-VÁLTOZÁS a
   fejen meglévő terv hivatkozott pontjával is igazolt; a lazítás visszaállítása / ugyanazon alany megmaradó állítása nem lelet; minták:
   `*.integration.ts`, `source/tests/support/`; többsoros állítás, új időkorlát módosított fájlban, tűrés-konstans a tesztfájlban,
   `.skip(` / `.fixme(` a CI-ban is; a kapu saját fájljainak változása hangos jelzés (K2); a `--json` egyetlen JSON (K4); a fej-tartalmak
   egyetlen `git cat-file --batch` hívással (K10); „Mit NEM fog meg” a runbookban és „ismert korlát” tesztként.
7. **Egyéb:** K5 (bővebb parancssor- és kimenet-szűrés az `evidence-run`-ban), K8 (a doksik és a kód egyeztetése), K9 (a számok
   forrással), K1 és K3 maradéka jegyre / a megfeleltetési táblába.

## R2 — Második javítókör (visszaellenőrzés `beeb4ec2`: NEM; jelentés: a scratchpad `review-szkriptkapuk/jelentes-2.md`)

1. **S8-B1:** felmentés („nem a PR hibája”) KIZÁRÓLAG a `known-flaky.json` jegyhez kötött, le nem járt (`reviewBy`) elemére; a
   rangsor szerinti, listán kívüli „ingadozó” új állapot: „ingadozó-gyanú, jegy kell” — nem ment fel; a lista `exclude` része
   (pl. a `joystick-response:629` block-craft eset, #106) és a „tartós bukás” soha nem ment fel.
2. **S8-M1:** a bukó teszt területe (`gates.config.json` `games` leképezés + közös játékmotor; bizonytalan teszt + termékkód-változás
   = érinti) → ha a PR érinti: „a PR hibája lehet — érintett terület”; ugyanaz a teszt a PR futásának több kísérletében bukott: nem
   ingadozó. A kimenet utolsó sora és a runbook: az ítélet csak JAVASLAT a bukott job újraindítására, a zöld futást NEM pótolja,
   merge csak zöld kötelező ellenőrzésekkel.
3. **S8-M2:** piros kísérlet + 0 értelmezhető tesztnév → „nem értelmezhető bukás”, kód 1.
4. **M2-maradék:** átírt rekord (hash-eltérés) MINDIG bukás; láncon kívüli / lánc nélküli rekord: `warn` módban az állítás
   „NEM IGAZOLT” (WARN, nem PASS), `block` módban bukás; `--repair` után az újra-láncolt (régi) rekord NEM igazolt bizonyíték — a
   kaput újra kell futtatni. A `record-review` kivétel-ága `block` módban megtagad.
5. **Közepesek:** zár — a türelem (45 s) > az árva-küszöb (30 s), élő PID zárját nem törli, az elmaradt rekord hangos és nem nulla
   kilépés; többsoros állítás a VALÓDI diff-alakkal (változatlan nyitó sor + megváltozott belső sor); a súlyos (BLOKKOLÓ / MAGAS)
   lelet jelölt idézet nélkül → WARN, a sablon előírja; üres listák + „minden zöld” próza → WARN; a terv-pont címsor / listapont
   szerint (nem részsztring); a `Nem létezik:` nagybetűvel; a szoletra-ág hamis riasztásai (nem-szám konstans, hunk-on belüli
   párosítás, a teljes bal oldal mint alany, fájl-fejléc jelölés); K1 a tiltásra váltás előfeltételei közé.

Szabályok minden szeletre: a `source/` futásidejű kódja nem módosul; minden szkript Node ESM, függőség nélkül, injektálható futtatóval
(`exec`), `node --test` tesztekkel, Windows x64 / ARM64 / Linux; regexet csak Edit / Write eszközzel írj és olvasd vissza; tesztet
gyengíteni tilos; titok / e-mail-cím / kapcsolati szöveg sehova (a tesztben a mintát futásidőben, darabokból); mutációs ellenpróba
commit / másolat után (C-70); commit-üzenet fájlból; a játékok lapjaihoz, magjaihoz, tesztjeihez és a `source/tests/support/*`-hoz
NEM nyúlunk (nyitott PR-ok); a `docs/agent-csapdak.md`-t nem módosítjuk. Amíg a #490 (`chore/kulso-ellenor`) nincs a mainen, a
`scripts/qa/gates/lib.mjs`, `pre-pr-gate.mjs`, `pre-merge-gate.mjs`, a `websuli-fejlesztesi-ellenor` skill nem módosul; az `AGENTS.md`
és a `docs/minosegkapuk.md` csak a #490 hunkjaitól távoli, rövid kiegészítést kap.

## S0 — Terv (ez a PR, csak doksi)

1. Fájlok: a terv és ez a végrehajtási fájl.
2. Parancs: `node scripts/qa/three-phase-check.mjs --base origin/main` → elvárt: „Nincs kódváltozás”.
3. `npm run gate:stage` → zöld; `npm run gate:push` → zöld; független ellenőr; `npm run gate:pr -- --body-file <leírás.md>`.

## S1 — Teszt-integritás kapu

### S1.1 Fájlok

- Új: `scripts/qa/gates/test-integrity.mjs`, `scripts/qa/gates/test-integrity.test.mjs`.
- Módosul: `scripts/qa/gates/gates.config.json` (`testIntegrity` + `modes`), `scripts/qa/gates/lint-gate.mjs` (egy lépés a
  `runLintSteps` végén), `.github/workflows/ci.yml` (egy lépés a „Háromfázisú rend” jobban), `docs/minosegkapuk.md` (szakasz).

### S1.2 Bemenet

- **Tartomány-mód** (mindig): `git diff -U6 --no-color -M <merge-base> --` a tesztfájl- és kalibrációs mintákra (munkafával együtt);
  a törölt tesztfájlokhoz `git diff --name-status --diff-filter=D`.
- **Commit-mód** (mindig, ha van commit): EGY hívás: `git log -p -U6 --no-color --no-merges -M --format=@@commit %H <base>..HEAD --`
  a mintákra. Ez fogja a PR-on belüli lazítást, amely a main-hez képest „új fájlként” látszik (J7b, `4da8b3b9`). A commit-mód
  leletét elejtjük, ha a lazított (hozzáadott) sor szövege a jelenlegi fájlban már nincs meg (később visszacsinálták).
- Tesztfájl-minták (`gates.config.json` → `testIntegrity.testPatterns`): `\.(test|spec)\.[cm]?[jt]sx?$`, `\.browser\.ts$`,
  `^source/tests/game-mobile-cases/`, `^source/playwright[^/]*\.config\.[cm]?ts$`. Kalibráció: `^source/client/src/lib/[^/]+/sim\.ts$`.

### S1.3 Szabályok (mindegyik egy leletet ad: `{ rule, file, line, commit?, text }`, érték kiírása csak a sor szövegéig, szűrve)

| Szabály | Mikor lelet |
|---|---|
| `test-file-deleted` | tesztfájl törölve |
| `test-removed` | egy fájlban a törölt `test(` / `it(` / `describe(` hívások száma nagyobb, mint a hozzáadottaké |
| `assert-removed` | egy fájlban a törölt állítás-sorok (`assert…(`, `expect(`, `t.assert`) száma nagyobb a hozzáadottakénál, és a többlet törölt sor egyike sincs meg szó szerint a hozzáadottak között (mozgatás) |
| `assert-commented` | hozzáadott sor: `//` vagy `/*` után állítás / teszt-hívás |
| `threshold-changed` | a törölt állítás-sorral párosított (azonos alany és ≥ 0,4 token-hasonlóság, ismeretlen alanynál ≥ 0,8; sok-az-egyhez — K8) hozzáadott sorban más a szám, a relációs jel, vagy új `± <szám>` tag van; ha az irány egyértelműen SZIGORÚBB (alsó korlát nő / felső csökken / `>=` → `>`), nem lelet, csak megjegyzés |
| `matcher-loosened` | a párban szigorú matcher (`toBe`, `toEqual`, `toStrictEqual`, `strictEqual`, `deepStrictEqual`, `equal`, `deepEqual`, `toHaveLength`, `toHaveCount`, `toHaveText`) lazára vált (`toBeGreaterThan*`, `toBeLessThan*`, `toContain*`, `toMatch`, `toBeTruthy`, `toBeDefined`, `ok`, `match`, `toBeCloseTo`) |
| `timeout-raised` | párban `timeout` / `setTimeout(` / `retries` száma nő; vagy módosított (nem új) fájlba `retries` kerül |
| `force-or-fixed-wait` | hozzáadott `force: true` vagy `waitForTimeout(` |
| `skip-added` | hozzáadott `.todo(`, `test.fail(`, feltételes `{ skip: … }` (az `.only` / `.skip` / `fixme` a lint-kapu FAIL-je marad) |
| `source-regex-test` | hozzáadott `readFileSync` / `readFile` a `client/`, `server/`, `shared/`, `pages/`, `lib/` forrásra egy tesztben |
| `sim-calibration` | kalibrációs fájlban egy NAGYBETŰS konstans (`const X_Y = <szám…>`) értéke változik |

### S1.4 Jelölés és átengedés

Egy lelet akkor jelölt, ha a sorában vagy a fölötte lévő ≤ 8 sorban (a hunk kontextusában; commit-módban a jelenlegi fájlban a sor
szövege fölött) `SPEC-VÁLTOZÁS` áll; a `source-regex-test`-nél a `FORRÁS-ŐR: <indok>` is jelölés. A jelölés **igazolt**, ha (1) a
jelölésben dátum (`ÉÉÉÉ-HH-NN`) és zárójeles hivatkozás van, ÉS (2) a hivatkozott `docs/specs/…md` (vagy, ha a hivatkozásban nincs
útvonal, bármely `docs/specs/*.md`) a tartomány-diffben változik, és a hozzáadott soraiban szerepel a tesztfájl neve (kiterjesztés
nélkül) vagy a `SPEC-VÁLTOZÁS` szó, ÉS (3) ha a PR-leírás elérhető (`--body-file`, `--pr-body-env`), abban szerepel a tesztfájl neve
és a `SPEC-VÁLTOZÁS` szó. Ha a PR-leírás nem elérhető (szakasz- / push-kapu), a (3) „később ellenőrzendő” megjegyzés.

Eredmény: jelöletlen VAGY nem igazolt lelet → `warn` módban `WARN`, `block` módban `FAIL`; csak igazolt leletek → `PASS` a számmal.
Rekord: `test-integrity-<fej>.json` (`findings`, `mode`, `ms`).

### S1.5 Lépések

1. `test-integrity.mjs`: tiszta függvények (megvalósítva — K8: `parseDiff`, `analyzeFile`, `subjectOf`, `thresholdDirection`,
   `stripGuard`, `joinLogical`, `findMarker`, `verifyMarker`, `analyze`) + `runTestIntegrityStep({ gate, ctx, mode, prBody })` + CLI (`--base`, `--mode warn|block`,
   `--body-file`, `--pr-body-env <VÁLTOZÓ>`, `--json`). Parancs: `node --test scripts/qa/gates/test-integrity.test.mjs` → zöld.
2. Tesztek: minden szabályra pozitív ÉS negatív eset (új teszt nem lelet; szigorítás nem lelet; mozgatott állítás nem lelet; jelölt +
   igazolt átmegy; jelölt, de spec nélkül nem igazolt; commit-módú lazítás, amelyet később visszacsináltak, nem lelet); a J7b-eset
   rögzített diff-mintával.
3. Bekötés: `lint-gate.mjs` `runLintSteps` végén egy lépés (`teszt-integritás (S1)`), mód a `gates.config.json` `modes` szerint
   (helyben `warn`). Commit; `npm run gate:stage`.
4. CI: a „Háromfázisú rend” jobban `node scripts/qa/gates/test-integrity.mjs --base origin/${{ github.base_ref }} --mode warn
   --pr-body-env PR_BODY` (a job nem bukik; `block` csak a terv 6.3a feltételei és tulajdonosi jóváhagyás után — vak review P1-K1) (`env: PR_BODY: ${{ github.event.pull_request.body }}` — a leírás környezeti változóban, nem a parancssorban).
5. Ellenpróba (csak olvasva): `node scripts/qa/gates/test-integrity.mjs --base origin/main --head origin/<ág>` az öt
   nyitott ágon (J1a, J3a, J5a, J6a, J7b). Elvárt: a J7b `tornado-sim.test.ts` „− 1” lazítása lelet; az Aszteroida
   `space-asteroid-play.spec.ts` küszöb-változása és a `DODGE_IMPACT` bot-konstans lelet; a jelölt és igazolt SPEC-VÁLTOZÁS átmegy.
   Minden leletet kézzel besorolunk (valódi / hamis riasztás); a hamis riasztást a párosítás pontosításával csökkentjük, a mérce
   lazítása nélkül. A számok a PR-leírásba.
6. Mutációs ellenpróba (commit után): a J7b-minta „− 1”-ét kivéve a teszt bukik; a jelölést kivéve a jelölt eset bukik.
7. Futásidő mérése (`ms` a rekordban); a szakasz-kapu ideje legfeljebb + 5 s.

## S2 — Állítás-ellenőrző és láncolt bizonyíték

### S2.1 Fájlok

- Új: `scripts/qa/gates/evidence-chain.mjs` (rekord + `chain.jsonl`, `appendRecord`, `verifyChain`), `scripts/qa/gates/evidence-run.mjs`
  (tetszőleges parancs futtatása és rögzítése: `node scripts/qa/gates/evidence-run.mjs -- <parancs> <arg…>` → `run-<id>`),
  `scripts/qa/gates/verify-report.mjs`, `scripts/qa/gates/report-template.md` (jelentés-sablon); tesztek (K8: megvalósult):
  `verify-report.test.mjs` (a verify-report, az evidence-run és a record-review esetei) és `evidence-chain.test.mjs`.
- Módosul: `scripts/qa/gates/stage-gate.mjs` és `pre-push-gate.mjs` `main()`-je (lánc-rekord a meglévő mellé), `AGENTS.md`
  („Minőségkapuk” szakasz végén egy mondat), `.agents/skills/websuli-pr-elotti-kapu/SKILL.md` + tükre, `docs/minosegkapuk.md`.

### S2.2 A gépi blokk

A jelentés végén egy kerített blokk, info-sztringje `json allitasok` (JSON, mert függőség nélkül értelmezhető):

```json allitasok
{
  "schema": "websuli-allitasok/1",
  "branch": "chore/kapu-allitas-ellenor",
  "head": "<40 jegyű hash>",
  "base": "origin/main",
  "changedFiles": ["scripts/qa/gates/verify-report.mjs"],
  "commands": [{ "cmd": "npm run gate:stage", "status": "PASS", "evidence": "stage-<fej>" }],
  "refs": [{ "file": "scripts/qa/gates/verify-report.mjs", "line": 10, "text": "export function" }],
  "pr": { "number": 492, "state": "OPEN", "ci": "pending" },
  "tests": [{ "cmd": "node --test scripts/qa/gates/verify-report.test.mjs", "pass": 12, "fail": 0, "evidence": "run-<id>" }],
  "gates": ["stage", "push", "review", "pr"],
  "notRun": [{ "what": "Playwright E2E", "reason": "nincs UI-változás", "risk": "nincs" }]
}
```

### S2.3 Az ellenőrzések (`verify-report.mjs --report <jelentés.md> [--head <ref>] [--base <ref>] [--no-gh]`; a fej és a bázis a hívótól — az R-kör M1 pontja szerint, ez felülírja a lenti „a blokk adja” részleteket)

1. Van pontosan egy `json allitasok` blokk, érvényes JSON, `schema` ismert; különben `FAIL` („érvénytelen jelentés”).
2. `head` létező commit, és az ág (`branch`) feje (`git rev-parse <branch>`); ha van `pr`, a PR `headRefOid`-ja is.
3. `changedFiles` = `git diff --name-only <base>...<head>` (halmaz-egyezés; a hiányzó és a többlet fájl név szerint).
4. `refs`: a fájl létezik a fejen (`git show <head>:<fájl>`), a sor létezik, és a `text` azon a soron (vagy a megadott
   `line: "12-15"` tartományban) megvan.
5. `commands` / `tests`: minden `PASS`-hoz van `evidence` rekord a tárban, `head`-je a jelentés feje, `code` = 0 / `ok` = true; a
   `tests` `pass` / `fail` száma egyezik a rekordba írt számmal, ha az rögzítette. `FAIL` állítás rekord nélkül is elfogadott (a
   bukás bevallása nem kitalálás).
6. `pr`: `gh pr view <n> --json state,headRefOid,statusCheckRollup` → az `state` egyezik; a `ci` a `rollupState` (a
   `pre-push-gate.mjs`-ből) értékével egyezik.
7. `gates`: a lánc nem hagy ki fázist — `pr` ⇒ `push` és `review` rekord a fejen; `push` ⇒ `pre-push-<fej>` (vagy `pre-pr-<fej>`);
   `review` ⇒ `review-<fej>`; `stage` ⇒ `stage-<fej>`.
8. A lánc (`chain.jsonl`) hash-ei egyeznek a hivatkozott rekordokéval (utólag átírt rekord → `FAIL`).
9. `notRun` minden eleméhez van `reason`.

Eredmény: lépésenként PASS / FAIL tábla; kilépési kód 1, ha bármely FAIL; rekord `claims-<a jelentés sha256-ának első 16 jegye>`.

### S2.3b Szabad szöveges hivatkozások (tulajdonosi utasítás 2026-11-17 este — a gépi blokktól függetlenül, MINDEN md-re)

Bemenet: egy jelentés / PR-leírás / zárójelentés (`--report <md>` vagy `--body-file <md>`) + egy fej (`--head <hash|ref>`, alapérték
a munkafa feje). A szkript kigyűjti és a fejen ellenőrzi:

| Hivatkozás | Ellenőrzés | HAMIS, ha |
|---|---|---|
| `fájl:sor`, `fájl:sor-sor` (backtickben vagy anélkül; `source/`-hoz relatív alak is: a `source/` előtag nélküli utat a `source/` alatt is keresi) | `git show <fej>:<fájl>` → létezik, van annyi sora; ha a hivatkozás mellett (ugyanabban a mondatban / sorban) backtickes kódrészlet áll, az a sor(ok) ±3 sorában szó szerint (szóköz-normalizálva) megvan | a fájl nincs a fejen, a sor túl van a fájl végén, vagy a kódrészlet nincs ±3 soron belül |
| backtickes útvonal (`scripts/qa/x.mjs`, `docs/…md`) | létezik a fejen (fájl vagy könyvtár) | nem létezik |
| `npm run <név>` | a gyökér VAGY a `source/package.json` `scripts` mezőjében van | egyikben sincs |
| `node scripts/…` | a fájl létezik a fejen | nem létezik |
| commit-hash (7–40 jegy, backtickben vagy „commit” szó mellett) | `git cat-file -e <hash>^{commit}` | nem létező commit |
| `#<szám>` PR / jegy (`PR #n`, `#n` a „PR” / „pull” szó mellett) | `gh pr view <n> --json number,state` (gh nélkül NEM ELLENŐRIZHETŐ) | a PR nem létezik |
| „N/M teszt”, „N teszt zöld”, „N pass” | ha a sorban `run-<id>` / `pre-push-<fej>` bizonyíték-azonosító áll: a rekord számával egyezik; különben NEM ELLENŐRIZHETŐ | a hivatkozott rekord más számot rögzített |

Kimenet: tételes **IGAZ / HAMIS / NEM ELLENŐRIZHETŐ** lista (a 6.6a konvenció szerint, `--json` is); a HAMIS bukás (kód 1); a
szkript futásképtelensége kód 2. A NEM ELLENŐRIZHETŐ nem bukás, de a számát a kimenet és a rekord tartalmazza (az orkesztrátor
látja, mennyi állítás maradt ellenőrizetlen). Kódblokkon (```…```) belüli szöveget nem értelmez hivatkozásként, kivéve a `json
allitasok` blokkot (azt az S2.3 nézi).

### S2.5 Bekötés a `gate:pr`-ba és a `record-review`-ba (a #490 után egy lépésben ráilleszthető)

A `pre-pr-gate.mjs` és a `lib.mjs` a #490-ben mozog, ezért a bekötés két kis, önálló hunk, amelyet ez a szelet `scripts/qa/gates/`
alatt EXPORTÁLT függvényként szállít, a hívást pedig a #490 összevonása után egy commitban illesztjük be:

- `verify-report.mjs` exportja: `runReferenceStep({ gate, ctx, text, label })` — egy kapu-lépés („hivatkozások: <label>”), HAMIS → FAIL.
- `pre-pr-gate.mjs` (#490 után): a „PR-leírás sablon” lépés UTÁN egy sor: `await runReferenceStep({ gate, ctx, text: prTexts[0] ?? '', label: 'PR-leírás' });`
  + az import (`./verify-report.mjs`); a `prTexts[0]` a lépés után a `--body-file` tartalma vagy a nyitott PR leírása.
- `record-review.mjs` (a #490 nem módosítja — ezért EBBEN a szeletben beköthető): a `buildRecord` előtt a jelentés hivatkozásai a
  `head`-en; HAMIS hivatkozásnál a rögzítés megtagadva („hamis hivatkozású jelentésből ítélet nem rögzíthető”), a hamis tételek
  listájával.
- A #490 utáni illesztést a PR-leírás és a `docs/minosegkapuk.md` „Ismert korlátok” sora rögzíti, a pontos beillesztendő sorral.

### S2.4 Lépések

1. `evidence-chain.mjs` + teszt (lánc építése, egy rekord átírása → `verifyChain` bukik). Commit; `gate:stage`.
2. `evidence-run.mjs` + teszt (injektált futtató; a rekord `head`, `cmd`, `code`, `outSha256`, `pass` / `fail` a TAP / node:test
   összesítőből). Commit.
3. `verify-report.mjs` + teszt: minden S2.3 pontra pozitív és negatív eset hamis gittel / gh-val / tárral. Commit; `gate:stage`.
4. A `stage-gate.mjs` és a `pre-push-gate.mjs` `main()`-je lánc-rekordot ír (`stage-<fej>`, a `pre-push` mellé).
5. `report-template.md`, a skill- és `AGENTS.md`-kiegészítés: az orkesztrátor csak `verify-report.mjs`-sel ZÖLDRE ellenőrzött
   alügynök-jelentést fogad el; a „kész / PASS” állítás csak bizonyíték-azonosítóval érvényes.
6. Próba a saját zárójelentésen: `node scripts/qa/gates/verify-report.mjs --report <zárójelentés.md>` → zöld; egy szándékosan hamis
   állítással (rossz sor, bizonyíték nélküli PASS) → `FAIL` a konkrét ponttal. A kimenet a PR-leírásba.

## Megbízások (kiadható szövegek a többi szeletre)

Mindegyik megbízás eleje (közös keret): „WEBSULI repó (`D:\repo\WEBSULI`, nyilvános; Windows x64 / ARM64). Magyarul dolgozz és
jelents. Olvasd el: `AGENTS.md` („Minőségkapuk”), `docs/minosegkapuk.md`, `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md`
(a te szeleted fejezete) és ennek a fájlnak a közös szabályait. Háromfázisú rend: a végrehajtási fájl ennek a fájlnak a te
szeleted-fejezete — a kód ELŐTT egy commitban frissítsd az „Állapot” sort. Saját munkafa és ág a friss `origin/main`-ről. Szakaszonként
`npm run gate:stage`; push előtt `npm run gate:push`; PR előtt független ellenőr (az orkesztrátor indítja), utána `npm run gate:pr --
--body-file <leírás.md>`. A zárójelentésed végén a `json allitasok` blokk (S2 formátum), és az orkesztrátor a
`verify-report.mjs`-sel ellenőrzi. Merge-et nem végzel.”

### S3 — Spec ↔ teszt követhetőség (párhuzamosan futhat: S5, S8; az S2 után)

- **Hatókör:** új `scripts/qa/spec-trace.mjs` + `spec-trace.test.mjs`; a `docs/specs/_TEMPLATE.md` elfogadási része kap egy
  formátumot; a `pre-push-gate.mjs` egy lépést (`spec ↔ teszt (S3)`, `warn`).
- **Formátum:** a spec `<!-- acceptance-checklist -->` jelölője utáni sorok: `- [ ] A3: WHEN … THEN … SHALL … — teszt:
  source/tests/<fájl>.test.ts › "<tesztnév részlet>"` (vagy `— szkript: <parancs>`, vagy `— kézi: <ok>`).
- **Ellenőrzés:** a PR-ban változó spec(ek) minden pontjához van hivatkozás; a hivatkozott fájl létezik, a tesztnév-részlet benne
  van; `[x]` pipa csak akkor, ha a fejre szóló bizonyíték (`pre-push-<fej>` teljes egységteszt PASS, vagy `run-<id>` a megnevezett
  fájlra, 0 kóddal) megvan; a `— kézi:` pont nem pipálható gépi bizonyíték nélkül, csak indoklással a PR-leírásban.
- **Elfogadás:** WHEN egy `[x]` pontnak nincs teszt-hivatkozása vagy bizonyítéka THEN `WARN` (később `FAIL`) a pont ID-jával; a mai
  21 jelölővel ellátott specen (a mainen 2026-11-17-én, `git grep -l "acceptance-checklist" -- docs/specs`) futtatva a hamis riasztás számolva a PR-ban.
- **Fájlok, amelyekhez NEM nyúl:** `lib.mjs`, `pre-pr-gate.mjs` (a #490 után egy külön hunk), a játékok.

### S5 — Telepítés utáni füstpróba + keretek (párhuzamosan futhat; diszjunkt)

- **Hatókör:** új `scripts/qa/post-deploy-smoke.mjs` + `post-deploy-smoke.test.mjs` (injektált `fetch`), új
  `scripts/qa/post-deploy-budget.json`; a `websuli-merge-elotti-kapu` skill (`.agents` + `.claude` tükör) „merge után” lépése;
  `docs/minosegkapuk.md` egy sor.
- **Ellenőrzés:** `/api/health` → `revision` = `git rev-parse origin/main` (a `verify-render-revision.mjs` `compareRevisions`
  újrahasznosítva, ha illik; telepítésre vár legfeljebb 15 percig, 30 s-os lekérdezéssel); a fő lapok (`/`, `/games` és a
  `post-deploy-budget.json` listája) 200; a kérdésbank (`/api/games/quiz-bank/<játék>`) hideg és meleg ideje a keret alatt
  (kiinduló keret: először MÉRD 3× élesben, és a mért medián × 1,5 legyen a keret; a 2026-11-17-i retro szerint a hideg építés
  12,7 s — ezt a keret ne rögzítse elfogadottnak, hanem a jegy (#71) céljához mérje, jelölve); a kérdésbank előmelegítése
  (játékonként egy kérés); `/api/player/status` és `/api/rt/status` a várt flag-értéken (a várt érték a budget-fájlban); opcionálisan a
  Render-napló hibaosztályainak összesítése (`RENDER_API_KEY` csak env-ből, kiírni tilos; a meglévő `verify-render-*` minta).
  Bizonyíték-rekord (`post-deploy-<fej>`).
- **Elfogadás:** WHEN a revision 15 percen belül sem egyezik, vagy bármely végpont nem 200, vagy a meleg keret sérül THEN kilépési
  kód 1 és a konkrét végpont; titok és e-mail-cím a kimenetben nincs (`redact`).

### S6 — Folyamat-higiénia (párhuzamosan futhat; a `pre-push-gate.mjs` hunk miatt az S2 után vond össze)

- **Hatókör:** új `scripts/qa/hygiene-check.mjs` + teszt; a `pre-push-gate.mjs`-ben egy új lépés (`csak-merge / zöld fejre push`);
  a globális session-végi higiénia szabály végrehajtó szkriptje.
- **Ellenőrzés (csak olvas, SOHA nem töröl):** munkafák (`git worktree list --porcelain`) ↔ nyitott PR-ok (`gh pr list`) ↔ helyi ágak:
  árva munkafa, összevont (a mainbe olvadt) de meglévő helyi ág, commitolatlan változás lezárt munkafában; kóbor fájlok a repó
  gyökerében (a követett / gitignore-olt listán kívül) és a meghajtó gyökerében (csak jelzés, a fájl nevével); kanban ↔ PR
  (összevont PR jegye nyitva; `in_review` jegy PR nélkül — a kanban CLI `list` kimenetéből); a csapda-katalógus indexe ↔ a `## C-nn`
  bejegyzések; a skill-tükör (`skills-sync-check.mjs`); nyitott review-szálak a saját PR-okon. A push-kapuban: ha a kimenő commitok
  mind merge-commitok (csak-merge push) VAGY a PR távoli fejének CI-ja zöld, és nincs `--indok "<szöveg>"` → `FAIL` (`warn` módban
  `WARN`).
- **Elfogadás:** a jelentés javaslatlistát ad (archiválás / törlés-jelölt / jóváhagyást igényel), a kimenet determinisztikus; a
  meglévő `zöld CI utáni push (C-62)` lépés átkerül ide vagy hivatkozza (egy igazságforrás).

### S7 — Teljesítmény-keret (a játék-PR-ok összevonása UTÁN; a mobil mérő nézetlistáját csak egyeztetve módosítsd)

- **Hatókör:** új `source/tests/game-perf.spec.ts`, `scripts/qa/perf-budget.json`, `scripts/qa/perf-budget.mjs` (keret-ellenőrző a
  mérés JSON-jára); a mérőszkript alapja a Kockavadász-diagnózis mérője (`<scratchpad>\kockavadasz-diag\measure.mjs`,
  `profile.mjs` — ha átvehető, tisztítva).
- **Mérés:** játékonként rögzített CPU-lassítással (CDP `Emulation.setCPUThrottlingRate` 4×) és nézetekkel — 390×844, 844×390,
  360×640, ÉS egy hajlítható, nagy, közel négyzetes, magas dpr-ű nézet (pl. 1812×2176 @ dpr 2,6 nyitott állapot) —: fps medián és
  p5 (`requestAnimationFrame`-mintavétel 10 s), 50 ms feletti hosszú feladatok (`PerformanceObserver longtask`), rajzolási hívások
  (WebGL hívásszámláló, C-66), vászon-megapixel; build-csomagméret (`dist/public/assets/*.js` gzip). Keret játékonként + „nem
  romolhat a mainhez képest > 15%”.
- **Elfogadás:** WHEN egy játék fps p5-je a kereten alul van az összehajtható nézeten THEN a spec bukik a nézet és a játék nevével;
  a mérés ugyanazon a gépen kétszer futtatva ±10%-on belül (zaj-mérés a PR-ban).

### S8 — Ingadozó-követő (párhuzamosan futhat; diszjunkt)

- **Hatókör:** új `scripts/qa/gates/flaky-report.mjs` + teszt (rögzített napló-mintákkal), új `scripts/qa/gates/known-flaky.json` (a szkript-kapuk fájlköre: `scripts/qa/gates/`);
  `docs/minosegkapuk.md` egy sor.
- **Működés:** `gh run list --branch main --workflow CI --limit <N>` + `gh run view <id> --log-failed` (a job-naplóból a bukó
  Playwright / node:test tesztnevek, kimenet-szűrve); egy teszt „ingadozó”, ha ugyanazon a fejen ismétlésre zöldült, vagy N futásból
  legalább 2-ben bukott, de nem egymás után. A `known-flaky.json` minden elemén kötelező a kanban-jegy száma (nincs csendes
  elfogadás); jegy nélküli új ingadozó → a riport első sora. A PR-kapu (tájékoztató) jelzi, ha egy PR CI-bukása kizárólag ismert
  ingadozó tesztben van („ne reagálj új pushsal” — a push-fegyelem 2. pontja).
- **Elfogadás:** WHEN egy PR bukó tesztje a listán van THEN a riport ezt a teszt nevével és jegyszámával mondja; a riport
  determinisztikus a rögzített naplókon.
- **Megvalósítva (2026-11-17, `chore/kapu-ingadozo`):** `scripts/qa/gates/flaky-report.mjs` — `--pr <n> [--attempt <k>]`, a
  `gh`-hívások korlátos újrapróbálása (legfeljebb 3 kísérlet, 2 s / 5 s várakozás, csak átmeneti hibánál; utána kód 2), a
  „tartós bukás” (a két legfrissebb main-futásban egymás után) elsőbbsége az „ingadozó” előtt, `known-flaky.json` jegyekkel
  (#76, #105; a #106 tartós bukás szándékosan nincs rajta).
- **Javaslat a merge-kapuhoz (a #490 után, egyeztetve):** ha a PR kötelező ellenőrzése piros, a `pre-merge-gate.mjs` hívja a
  `flaky-report --pr <n> --json`-t, és a FAIL üzenetében kiírja az ítéletet és a teendőt: „ismert ingadozó, a PR nem érinti a
  fájlt → a bukott job újraindítható (`gh run rerun <id> --failed`)”, illetve „a PR hibája lehet → javítani kell”. A kapu ettől
  NEM enged át pirosat — csak megmondja a következő lépést, bizonyítékkal (futás-azonosító, számok, jegy).

### S4 — Játék-szerződés készlet (terv: a terv 6.4 fejezete; a #483–#486 és a J7b összevonása UTÁN adható ki)

- **Hatókör:** a terv 6.4 adapter-interfésze és kilenc esete; játékonként egy adapter; a hét sim-gyár `coupon?` opciója; a
  `game-contract-gate.mjs`. Közös fájlokhoz (`game-sim.ts`, `questionDirector.ts`) csak additív bővítés.
- **Elfogadás:** WHEN egy `gates.config.json` `games`-beli játéknak nincs adaptere, vagy egy eset indoklás nélkül hiányzik THEN a kapu
  bukik; a mai hét ellenőri próba-szkript (passzív, zajos, kupon, monotonitás) mindegyike a készlet egy esetének felel meg.
