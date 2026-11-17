# Szólétra olvashatóság — végrehajtási utasítás (AI-ügynöknek)

**Terv:** [`docs/specs/2026-11-17-szoletra-olvashatosag.md`](2026-11-17-szoletra-olvashatosag.md) (cél, nem-cél, mért
kiinduló számok, döntések A–F, EARS SZ-1…SZ-10). **Állapot:** folyamatban (helyi kapuk) — ág `fix/szoletra-olvashatosag`, munkafa
`.claude/worktrees/szoletra-olvashatosag`, kanban #89.

## Hatókör

Módosítható: `source/client/src/lib/wordLadder/{pacing.ts (új),sim.ts}`, `source/client/src/pages/WordLadderHuEn.tsx`,
`source/client/src/game-engine/play/InlineQuestion.tsx` (CSAK az opcionális `promptFocus` prop), `source/client/src/index.css`
(CSAK új `.play-question-frame` / `-focus` / `-blank` szabályok a `@layer components`-ben), `source/client/src/game-engine/vocab/
questionGenerator.ts` (CSAK az opcionális `focus` mező), `source/client/src/data/wordLadder/{types,en,de,fr}.ts` (`focus` mező),
tesztek: `source/tests/word-ladder-{pacing,sim,core,validate}.test.ts`, `word-ladder-play.spec.ts`, új
`word-ladder-readability.spec.ts`, `source/tests/support/word-ladder-reader.ts` (új), `source/tests/game-play-inline-focus.test.ts` (új),
`docs/measurements/jatekok-jatekelmeny/J2-olvashatosag/*`, a J2 fejezet egy hivatkozó sora.
NEM módosítható: `GE/play/questionDirector.ts`, `reading.ts`, `questionUi.ts`, más játék lapja / magja, `scripts/qa/gates/*`,
`AGENTS.md`, `docs/agent-csapdak.md`, `tests/support/game-sim.ts`, `tests/support/game-mobile-quality.ts`.

## Lépések

1. **Docs-commit (ez a fájl + a terv + az ELŐTTE képek + a J2 hivatkozó sor).** `node scripts/qa/three-phase-check.mjs --base origin/main`.
2. **`pacing.ts`** (tiszta): `LadderTempo`, `DEFAULT_LADDER_TEMPO = "calm"`, `ladderWindowMs`, `sharedWindowMs`, `fullReadMs`,
   `ladderRivalSecPerRung`, `ladderWallRungs`, `ladderFreeGripMs`, `ladderXpScale`, `paceDirector`, `armedAt`,
   `LEAD_IN_MS = 600`, `loadLadderTempo` / `saveLadderTempo` (`websuli.wordladder.tempo`). A paraméterek a terv A–B-je.
   Teszt: `tests/word-ladder-pacing.test.ts` — évfolyam × prompthossz táblázat (ablak ≥ olvasás + döntés; ≥ 2× közös ablak;
   3–4. évf. átlagos szókérdés ≥ 12 s; monoton a hosszal, nem nő az évfolyammal; ≤ plafon), Gyors = közös ablak, tempó-tárolás
   (hibás / ismeretlen → calm), `paceDirector` (azonos identitás, előjelzés, a director kimenete változatlan), rivális lassabb.
   Szakasz-kapu.
3. **`sim.ts`**: `tempo` opció (alap calm), `bank` opció (valódi tételek), a director `paceDirector`-ral, a világ
   `createFixedLoop`-pal és `slowMo`-val, előjelzés alatti koppintás hatástalan (`earlyTaps`), `question()` a szöveget is adja.
   `tests/support/word-ladder-reader.ts`: emberi olvasó-bot (teljes olvasás + döntés, lognormális). `tests/word-ladder-sim.test.ts`:
   a régi elvárások a Gyors tempón (SPEC-VÁLTOZÁS jelöléssel ahol változik), új SZ-7 tesztek Nyugodt tempón valódi bankkal.
   Szakasz-kapu.
4. **Célszó-adat:** `questionGenerator.ts` `focus`; `LadderItem.focus` + egyszeri generálás (áttekintve) a három kézi bankba;
   `tests/word-ladder-validate.test.ts` őr (+ a generátor tesztje: `focus` ⊂ prompt minden típusnál). Szakasz-kapu.
5. **`InlineQuestion` `promptFocus`** + CSS; `tests/game-play-inline-focus.test.ts` (renderToStaticMarkup: prop nélkül a kimenet
   azonos a mostanival; prop-pal keret + kártya + hiány-jelölés; nem rész-szöveg → nincs kiemelés). Szakasz-kapu.
6. **Lap (`WordLadderHuEn.tsx`)**: tempó-állapot + választó (kezdőképernyő, szünet menü), `paceDirector` a `useQuestionDirector`
   fölött, `revealWrongMs`, rivális / fal / szabad fogás / XP a `pacing`-ból, élesítés-kapu a `grab`-ban és a fogásokon,
   `promptFocus` (azonosító szerinti tárolás), `?wall=` (teszt-kampós / DEV build), a nyugodt időcsík, fogás-betű ≥ 17 px,
   probe: `tempo`, `armedAt`, `windowMs`. Szakasz-kapu.
7. **E2E**: `word-ladder-play.spec.ts` determinisztikussá (terv F); új `word-ladder-readability.spec.ts`: (a) az óra csak
   ≥ 400 ms után indul, előjelzés alatti koppintás hatástalan (lapon belül, képkockánként); (b) célkártya ≥ 1,6× betű, ≥ 3:1
   kontraszt, nem lóg ki, nem törik szó közepén — 3 nézet, a kézi bank és a szóbank leghosszabb célszavaival (a spec
   programmal keresi ki őket a bankfájlokból). A lap a tételeket a valódi kérdés-úton mutatja: ÚJ `?wlItems=<id,…>` (csak
   teszt-kampós buildben, mint a `?seed=`) — a forrás első új tételei ezek (kézi bank: az id; szóbank: `vocab:<bejegyzés>:<típus>`,
   a lap a generátorral építi); (c) a hiányos mondatos típus ugyanígy; (d) tempó-választó működik és újratöltés után megmarad.
   Futtatás CI-azonos úton (buildelt szerver, szoftveres WebGL, `--workers=1`, port 5232). A közös mobil mérő
   `-g word-ladder`, a meta-mérő és a lejárt-kupon spec Szólétra-esetei.
8. **UTÁNA képek** mindhárom nézetben + mérőszkript (`measure.mts new`) + sim-tábla a végrehajtási fájl „Mért számok” részébe.
9. **Push előtti kapu** (átmeneti kapu 2.), ÖNELLENŐRZŐ LISTA 3(a)–(f) tesztekkel, jelzés az orkesztrátornak a PR ELŐTT.

## Parancsok (a `source/` mappából, mind külön hívásban, saját kilépési kóddal)

- `git diff --check`; `npx.cmd eslint <változott fájlok> --max-warnings 0`; `npm run check`; `npm run check:test`
- `node --import tsx --test tests/word-ladder-pacing.test.ts tests/word-ladder-sim.test.ts tests/word-ladder-core.test.ts tests/word-ladder-validate.test.ts tests/game-play-inline-focus.test.ts`
- őrök: `node --import tsx --test tests/*-guard.test.ts`
- e2e (PowerShell): `npm.cmd run test:e2e -- --config <scratchpad CI-azonos config> tests/word-ladder-play.spec.ts tests/word-ladder-readability.spec.ts`
- push előtt: `npm run lint`, `npm test`, `node scripts/qa/three-phase-check.mjs --base origin/main`

## Ellenőrzőlista (átmeneti kapu 3.) — mindegyikhez teszt

- (a) véletlen válasz: előjelzés alatti koppintás / billentyű hatástalan (pacing + sim + e2e).
- (b) kupon módban kis leckével sem fogy el a kérdés — a Szólétra kérdésforrása nem változik (a meglévő kupon-spec zöld).
- (c) a leghosszabb válaszok teljes szöveggel olvashatók mindhárom nézetben (e2e, valódi szélesség).
- (d) a sim ugyanazt a magot és szabályt hajtja (paceDirector, fixed loop, slowMo, előjelzés), emberi reakcióidővel.
- (e) győzelem nem fordul vereségre a kijelzés alatt (a mag `phase`-e végleges; meglévő core-teszt).
- (f) a megállítási okok nem oldják fel egymást (szünet / Miért? / kibontás / kupon alatt az óra és az előjelzés is áll — a
  kérdés-óra közös; meglévő `game-explanation-pause.spec.ts` + mobil mérő).

## Mért számok (2026-11-17, a 8. lépés)

Forrás: a scratchpad `measure.mts` (a valódi angol kézi bank + a központi szóbank adott szintje, a lap képletével) és
`tune.mts` / `T/word-ladder-sim.test.ts` (20 seed, emberi olvasó-bot `T/support/word-ladder-reader.ts`, valódi tételek).

**Válaszablak (medián, s; zárójelben a leghosszabb tételé) — ELŐTTE → UTÁNA Nyugodt / Normál / Gyors**

| Évf. | Kérdésfajta | Előtte | Nyugodt | Normál | Gyors |
|---|---|---|---|---|---|
| 3. | magyar → angol (szóbank) | 5,6 | 16,9 (36,1) | 11,7 (25) | 5,6 (9) |
| 3. | angol → magyar (szóbank) | 5,6 | 18,4 (34,6) | 12,7 (24) | 5,6 (9) |
| 3. | hiányos mondat (szóbank) | 6,2 | 19,8 (24,3) | 13,7 (16,8) | 6,2 (8,2) |
| 3. | kézi szó / témakör | 5,6 | 13,2–14,6 | 9–10 | 5,6 |
| 3. | hétköznapi helyzet (kézi) | 9,0 | 30,2 (40) | 20,9 (25) | 9,0 |
| 5. | magyar → angol | 4,5 | 12,7 (28,2) | 8,6 (19,4) | 4,5 (7,5) |
| 5. | hiányos mondat | 5,5 | 17,1 (20,4) | 11,7 (14) | 5,5 (7) |
| 8. | angol → magyar | 4,5 | 13,1 (22,9) | 8,9 (15,7) | 4,5 (6,5) |
| 8. | mondat jelentése | 9,0 | 33,6 (40) | 23,1 (25) | 9,0 |
| 11. | magyar → angol | 4,5 | 11,2 (23,8) | 7,6 (16,3) | 4,5 (6,8) |
| 11. | mondat jelentése | 9,0 | 34,1 (40) | 23,5 (25) | 9,0 |

Az óra mostantól 600 ms előjelzés után indul (előtte: a kérés pillanatában, a beúszás alatt már járt).

**Rivális:** előtte 6,3 s / fok (1. pálya) → 5,4 s (10. pálya), a kérdés alatt teljes sebesség. Utána Nyugodt: 7,5 / 7 /
6,6 / 6,8 s / fok (3–4 / 5–6 / 7–8 / 9–12. évf.), pályánként −0,08 s, a kérdés alatt 0,35× (a gyakorlatban kb. 2× lassabb
haladás); Normál: 6,9 / 6,6 / 6,4 / 6,5, −0,08 s, 0,5×; Gyors: a régi. Hibás válasz utáni kijelzés 2 s → 3 s.

**Emberi olvasó-bot (1. pálya, 20 seed): az ablakon belül végigolvasott és megválaszolt kérdések aránya**

| Profil | Előtte (= Gyors) | Nyugodt | Normál |
|---|---|---|---|
| lassú olvasó (0,6× évf.-sebesség, 65%) | 0–0,3% | 99,3–99,7% | 61–63% |
| átlagos (0,8×, 75%) | 1,8–6,7% | 100% | 96–99% |
| erős (1,2×, 92%) | 37–48% | 100% | 100% |

**Győzelem / menethossz / kérdés-perc (Nyugodt, 1. pálya → 6. pálya; évf. 3 / 5 / 8 / 11)**

- átlagos olvasó: 15 / 14 / 17 / 15 győzelem a 20-ból (1. pálya), 17 / 14 / 18 / 11 (6. pálya); menet medián 124–193 s (1.),
  227–279 s (6.); 4,5–5,6 kérdés / perc. Előtte (régi tempón) ugyanez a profil: 0/20.
- lassú olvasó: 3–7 / 20 (1. pálya), 1–3 / 20 (6.); erős: 20 / 20.
- pontosság szerint (4. és 8. évf.): monoton (teszt); kérdéssel ≥ kérdés nélkül (teszt).
- Gyors tempón a régi elvárások: SIM_AVERAGE ≥ 10 kérdés / perc, 50–80% győzelem, 2–5 perc (teszt).
