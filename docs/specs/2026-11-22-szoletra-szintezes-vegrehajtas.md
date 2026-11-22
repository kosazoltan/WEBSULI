# Szólétra szintezés — végrehajtási utasítás (AI-ügynöknek)

**Terv:** [`docs/specs/2026-11-22-szoletra-szintezes.md`](2026-11-22-szoletra-szintezes.md) (teljes útvonal:
`docs/specs/2026-11-22-szoletra-szintezes.md`). **Ág:** `feat/szoletra-szintezes`, munkafa
`.claude/worktrees/szoletra-szintezes` (`origin/main` 0645f48f-ről). Push / PR / merge: az orkesztrátor.

Parancsok a `source/` mappából (Windows: `npx.cmd`, `npm.cmd`). Fizetős AI-hívás TILOS (S1–S2); S3-ban csak a jóváhagyott, gépileg számlált kereten belül (≤ 25 USD).

## S1 — mérce, osztályozás, évfolyam-sávos bank, lépés-szabály (tiszta modul + teszt)

1. **Bukó teszt előbb:** `source/tests/word-ladder-grading.test.ts` — importálja a még nem létező
   `../client/src/lib/wordLadderGrading` modult. Esetek (terv 6. A1–A8, A12):
   - A1/A3: `ladderItemStep` mindhárom nyelv kézi bankján (`WORD_LADDER_EN/DE/FR`) és szóbankján (`VOCAB_EN/DE/FR`,
     `vocabEntryStep`): véges pont, 0–14, `floor(step/3) ≥ tier`; pont ≥ 20 → szint ≥ 1, ≥ 40 → ≥ 2.
   - A2: fokozat-szintenként az átlagpont szigorúan nő; nyelv × szint × alfok ≥ max(10, 5 %).
   - A4: `gradedLadderBank(items, lang, grade)` évfolyam-sávonként: a sáv minden fokozatán ≥ 20 tétel, a 0. alfokon ≥ 20 szó, a 2. alfokon ≥ 20
     kifejezés-tétel (kézi `phrase` / `everyday` kategória, szóbank `kind: "phrase"`).
   - A5/A6: `ladderStartStep(grade, level)`: 1. pálya = alap×3; pályánként nem csökken; ≤ (alap+1)×3; `ladderGradeWindow`.
   - A7: `createLadderStepSession`: 3 jó → +1; 2 rossz → −1; jó-jó-rossz-jó-jó → nem nő; sávban marad (12 jó / 12 rossz).
   - A8: 3. évfolyam, pálya 1–10, 200 véletlen válaszsorozat (seedelt): a választott tételek (`pickUnseen` a sávra vágott
     vödrökön) fokozata ≤ 5.
   - A12: `LADDER_STEP_OVERRIDES` kulcsai létező kézi azonosítók, értékük 0–14.
   Futtatás: `npx.cmd tsx --test tests/word-ladder-grading.test.ts` → **várt: bukik** (hiányzó modul).
2. **Kód:** `source/client/src/lib/wordLadderGrading.ts` a terv 4.1–4.4 szerint:
   `LADDER_LETTER_FACTOR`, `LADDER_CATEGORY_WEIGHT`, `ladderDifficultyInput`, `ladderDifficultyScore`, `LADDER_TIER_FLOORS`,
   `LADDER_SUB_CUTS`, `LADDER_STEP_OVERRIDES` (üres), `LADDER_STEP_COUNT = 15`, `ladderItemStep`, `vocabEntryStep`,
   `ladderGradeWindow`, `ladderStartStep`, `createLadderStepSession`, `ladderStepBuckets`, `windowLadderSteps`,
   `gradedLadderBank`, `LADDER_GRADE_BANDS`. Csak relatív importok (node-teszt).
3. Futtatás: `npx.cmd tsx --test tests/word-ladder-grading.test.ts` → **várt: mind zöld**. Ha az A2 / A4 küszöb nem teljesül,
   a mért számot a tervbe kell írni, és a terv döntése szerint (nem a teszt gyengítésével) kell javítani.

## S2 — bekötés a játékba

4. `source/client/src/lib/wordLadderLevels.ts`: `ladderTierForLevel(grade, level)` = `floor(ladderStartStep(grade, level) / 3)`
   (dokumentált spec-változás, terv 4.2); a fejkomment frissül.
5. `source/tests/word-ladder-levels.test.ts`: a „6. döntés: … 10. pálya = legfelső szint” teszt az új szabályra
   (cím: „SPEC-VÁLTOZÁS 2026-11-22”); az ismétlés-mentességi teszt az új választóval (`createLadderStepSession` +
   `windowLadderSteps(ladderStepBuckets(...))`) — a régi változat is marad mellette (a `createLadderLevelSession` továbbra is
   exportált, más teszt használja).
6. `source/client/src/pages/WordLadderHuEn.tsx`:
   - `levelSessionRef` → `stepSessionRef = useRef(createLadderStepSession(4, 1))`; `onOutcome`: `.answer(correct)`;
     `startGame`: `.reset(grade, level)`, `runTierRef.current = floor(step / 3)`.
   - szóbank-készlet: a `toLadderItem(q)` eredménye a `q.focus`-szal (besoroláshoz).
   - `stepBuckets = useMemo(ladderStepBuckets(allTiers, lang))`; a választó: `windowLadderSteps(stepBuckets, grade)` vödrökön
     `pickUnseen(..., step, ...)`; tartalék a teljes vödörsor.
   - probe: `ladderStep` (a futás fokozata) és `questionStep` (a nyitott kérdés fokozata, azonosító szerint).
7. `source/tests/word-ladder-play.spec.ts` új eset (A9): `websuli.classroomGrade = 3`, friss tároló (1. pálya),
   `?seed=5&wall=60`, a teszt-kampós `data-correct="true"` fogással 12 helyes válasz; probe `questionStep` mind ≤ 5, az első
   ≤ 2, az utolsó > az első.
8. Ellenőrzés:
   - `npx.cmd tsx --test tests/word-ladder-grading.test.ts tests/word-ladder-levels.test.ts tests/no-repeat.test.ts`
     és a többi `tests/word-ladder-*.test.ts` → zöld;
   - `npx.cmd tsc --noEmit` → 0 hiba;
   - `npm.cmd run test:e2e -- tests/word-ladder-play.spec.ts` (Chrome 158 / Playwright 1.57 „Target page … closed” hiba
     környezeti — jelezni, nem megkerülni);
   - a munkafa gyökeréből `npm run gate:stage` → zöld.
9. Commitok (atomi, `git commit -F <scratchpad-fájl>`): docs → S1 → S2. Csapda-bejegyzés `C-SZL-1` ideiglenes sorszámmal a
   `docs/agent-csapdak.md`-be, ha a munka közben hiba / tévút történt.

## Döntések és PR-bontás (2026-11-22)

- ND-1 (a) évfolyam-sáv, ND-3 (a) a mérce kezeli — DÖNTÖTT (terv 9. szakasz). ND-2 (b) fizetős generálás — S3, csak külön
  költségkeret-jóváhagyás után (terv 12. szakasz). JÓVÁHAGYVA: ≤ 25 USD (tulajdonos, 2026-11-22).
- **PR-1** `feat/szoletra-szintezes-1`: ez a fájl + a terv + `source/client/src/lib/wordLadderGrading.ts` +
  `source/tests/word-ladder-grading.test.ts` + C-SZL-1 (`docs/agent-csapdak.md`) — az éles működés változatlan.
- **PR-2** `feat/szoletra-szintezes-2` (a PR-1-re épül): S2 (4–8. lépés): `wordLadderLevels.ts`, `WordLadderHuEn.tsx`,
  `word-ladder-levels.test.ts`, `word-ladder-3d-wiring.test.ts`, `word-ladder-play.spec.ts`.

## S3 — sűrűbb kezdő A1 anyag (JÓVÁHAGYVA: ≤ 25 USD (tulajdonos, 2026-11-22))

Ág `feat/szoletra-a1-bank` (a `feat/szoletra-szintezes-1`-ről, 896eef7f), munkafa `.claude/worktrees/szoletra-a1-bank`.
Keret: **legfeljebb 25 USD összesen** (próbakör + teljes futás + vak megoldó + javító kör), gépi költségszámlálóval és
futáskorláttal. Éles DB, `db:push`, e-mail, push / PR / merge, kódellenőri vak futtató, képgenerálás: TILOS (orkesztrátor).

**Tények a valódi generáló útvonalról (ellenőrizve 2026-11-22):**
- A meglévő szóbank ügynöki úton készült: Sonnet-gyártó-alügynök = egy szintfájl, Opus vak megoldó
  (`docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md:667`, `:696–706`). Fizetős API-t hívó szóbank-generátor és
  költségszámláló a repóban NINCS: a `source/scripts/vocab-bank.ts` parancsai `report`, `blind-export`, `blind-score`
  (`:1–7`, `:247–267`). A jóváhagyás gépi számlálót kér, ezért S3-hoz új, keretes generátor kell (10. lépés).
- Kulcs: `OPENROUTER_API_KEY` a környezetből (értéke soha nem íródik ki). Költség: az OpenRouter válasz
  `usage.cost` mezője (a kérésben `usage: { include: true }`) — becslés nincs; ha a mező hiányzik, a futás megáll.
- Modellek (OpenRouter `/api/v1/models`, 2026-11-22): gyártó `anthropic/claude-sonnet-5.5` (2 / 10 USD / M token),
  vak megoldó `anthropic/claude-opus-5.5` (4 / 20 USD / M token) — a 2026-11-15-i Sonnet-gyártó / Opus-megoldó felosztás.
- Fokozat: `vocabEntryStep` (`source/client/src/lib/wordLadderGrading.ts:124`) — 0. szinten pont ≤ 5 → 0. fokozat,
  ≤ 9 → 1. fokozat (`LADDER_SUB_CUTS`, `:32–38`; pont: `ladderDifficultyScore`, `:85`).
- Duplikátum: a validátor a teljes bankon `normalizeTerm` szerint tiltja (`source/client/src/data/vocabBank/validate.ts:10`,
  `:109–113`); a kézi Szólétra-bankkal (`data/wordLadder/<nyelv>.ts`) a célrész (`ladderDifficultyInput`,
  `wordLadderGrading.ts:66`) névelő nélkül vetendő össze — ezt a generátor szűri.
- Szerkezeti őr: `vocabBankProblems` (`validate.ts:72`), `minimumProblems` (`validate.ts:162`; phrase-arány ≥ 30 %).
  Mért kiindulás (kézi + szóbank, egyes szó): 0. / 1. fokozat en 222 / 181, de 171 / 145, fr 109 / 186; phrase-arány
  en 34,6 %, de 36,0 %, fr 36,1 % → +300 egyes szó után is ≥ 31 %.
- Vak megoldó: a `blindExport` (`vocab-bank.ts:158`) a szint MINDEN bejegyzését exportálja (en L0: 554); az új tételekhez
  `--only <id-lista.json>` kapcsoló kell (a disztraktor-készlet a teljes bank marad); a `blind-score` (`:211`) változatlan.

**Lépések:**

10. `source/scripts/vocab-bank-generate.ts` (új): `generate` (jelöltek nyelvenként, cél-fokozat 0 / 1, kizáró lista =
    a teljes szóbank + a kézi bank célrészei) és `solve` (vak megoldó a `blind-export` kérdésfájlján). Közös napló
    (`--ledger`, JSONL: idő, fázis, modell, token, `usage.cost`); minden hívás ELŐTT: napló-összeg + a hívás legrosszabb
    költsége (bemenet-becslés × bemeneti ár + `max_tokens` × kimeneti ár) > `--budget-usd` → leáll, hívás nélkül.
    A jelölteket a szkript helyben szűri: fokozat (`vocabEntryStep`), duplikátum, `vocabBankProblems`; azonosító a téma
    következő sorszáma (`<nyelv>0-<téma>-NNN`); a sorok a `level-0.ts` végére kerülnek, külön blokkban.
11. **Próbakör:** nyelvenként ~10 elfogadott szó, mért költség. Vetítés = próbakör-költség / elfogadott tétel × 900;
    **> 22 USD → STOP** (a teljes futás nem indul, a mért számok jelentésbe).
12. **Teljes futás:** nyelvenként legfeljebb +300 új 0. szintű egyes szó, a fokozatonkénti hiány szerint elosztva
    (cél: 0. és 1. fokozat külön-külön ≥ 300; en ≥ +78 / +119, de ≥ +129 / +155, fr ≥ +191 / +114 = 305 > 300 — a fr
    1. fokozata a +300-as plafonon belül legfeljebb 295-ig jut, ezt a jelentés NOT DONE-ként jelzi, ha nincs más döntés).
    Futáskorlát: `--budget-usd` = 25 − (eddigi napló-összeg), tartalék a vak körre.
13. **Vak megoldó:** `node --import tsx scripts/vocab-bank.ts blind-export --lang <l> --level 0 --seed 1122 --only <ids> --canary 10 …`
    → `vocab-bank-generate.ts solve` (Opus, csak a kérdésfájlt kapja) → `blind-score` → kanári 10/10 kötelező; a jelzett
    tételek elbírálása, javítás (azonosító marad) vagy törlés; a javított tételekre újabb kör, amíg a valódi hiba 0.
    Jegyzőkönyv: `docs/measurements/2026-11-22-szoletra-a1-bank.md` (költségnapló-összeg, modellek, kanári, jelzések).
14. Ellenőrzés: `npx.cmd tsx --test tests/vocab-bank-validate.test.ts tests/word-ladder-grading.test.ts` + a többi
    `tests/vocab-*.test.ts` / `tests/word-ladder-*.test.ts` zöld; a 0–1. fokozat egyes-szó-száma újramérve (előtte / utána
    tábla a terv 12. szakaszában); a munkafa gyökeréből `npm run gate:stage`. A tényleges költség a PR-leírásba.

## Mért számok (2026-11-22)

- **S1:** `tests/word-ladder-grading.test.ts` — előbb bukott (hiányzó modul), a kód után 8/8 zöld. Két küszöb a mért táblából
  javítva (terv 11. szakasz, csapda C-SZL-1): A4 (kifejezés a 2. alfokon), A5 (10. pálya ≤ min(sáv teteje, (alap+1)×3)).
  Mutációs ellenpróba: a sáv felső korlátja 14-re → A5, A7, A8 bukik; a lépés-szabály 1 jó válaszra → A7 bukik.
  Legkisebb fokozat-vödör (kézi + szóbank): de 11. fokozat 9 szó + 132 kifejezés; minden sáv minden fokozata ≥ 20 tétel.
- **S2:** `tests/word-ladder-levels.test.ts` — a SPEC-VÁLTOZÁS-teszt az új szabály előtt bukott, utána zöld; az új
  ismétlés-mentességi teszt (évfolyam × pálya, sávon belül) zöld. `tests/word-ladder-3d-wiring.test.ts` a lap új bekötését
  (`createLadderStepSession`, `windowLadderSteps`) követeli (dokumentált spec-változás). A Szólétra 16 egységteszt-fájlja +
  `no-repeat`: 135/135 zöld; `tsc --noEmit` 0 hiba.
- **Böngésző (A9):** `npm.cmd run test:e2e -- tests/word-ladder-play.spec.ts --workers=1` → 2 passed (2,5 perc); mért sor: `A9|kérdés-fokozatok: 0,0,0,1,1,1,2,2,2,3,3,3 | futás-fokozat: 0,0,0,1,1,1,2,2,2,3,3,3` (3. évf., 1. pálya, 12 helyes válasz: 0. szintről indul, 3 jó után +1 fokozat, max 3 ≤ 5).
- **`gate:stage`:** a 24 őrteszt közül a `memory-index-guard` („nincs indexeletlen élő memóriafájl”) bukik a
  `memory/notes/00-Index.md` miatt — ezt a `origin/main` 0645f48f (`chore(zaro-hurok)`) hozta be, a munkaág nem érinti a
  `memory/` mappát. Minden más lépés PASS.
- **S3 (2026-11-22, `feat/szoletra-a1-bank`):** próbakör 6 hívás 0,2869 USD (3 csonkolt, C-SZL-2), 36 elfogadott szó →
  vetítés 7,17 USD ≤ 22; teljes generálás 18 hívás 1,9281 USD; vak megoldó 53 hívás 5,0899 USD; **összesen 7,3048 USD**.
  0. / 1. fokozat egyes szó: en 372 / 328, de 316 / 300, fr 300 / 295. Kanári 10/10, 10/10, 9/10 (a fr kimaradt kanárija
  valódi tartalmi hibát jelzett, tétel törölve); utolsó körben valódi hiba 0. A Szólétra / szóbank egységtesztek 221/221
  zöldek, `tsc --noEmit` 0 hiba. Jegyzőkönyv: `docs/measurements/2026-11-22-szoletra-a1-bank.md`.
