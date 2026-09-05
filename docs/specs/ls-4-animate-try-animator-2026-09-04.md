# LS-4 — Animáció, gyakorlat, Animator lépés, szigorú CSP, TTS, Space + BlockCraft

**Dátum:** 2026-09-04 · **Kanban:** #153 · **Alap:** lesson-studio-master-plan-2026-09-04 (4. §)
**Stacking:** az Animator lépés a LS-2c runner-mintájára épül → az ág a
`feat/ls-2c-pipeline-calls` tetején nyílik (vagy annak merge-je után mainről).

## Mért jelenlegi állapot (2026-09-04, repóból)

- `LessonRuntime.tsx`: az `animate` és `try` blokk `PendingBlock` placeholder-t
  renderel (220-227. sor) — a séma (`lesson-schema.ts` `ANIM_KINDS` 8 + `TRY_KINDS`
  3 értékkel) LS-2 óta kész, a renderelés nincs.
- Animator: a modell deklarálva (`models.ts`: `animator: "qwen/qwen3.8-flash"`),
  de NEM fut — a `runPipelineStep` nem ismeri a lépést (a LS-2c-ben bekötött
  pedagogue/author/lektor mellett ez az egyetlen futatlan deklarált modell).
- CSP: helmet-konfig a `server/index.ts` 93. és 155. soránál; a generált HTML-hez
  meta-CSP `'unsafe-inline'`/`'unsafe-eval'`-lel (`routes.ts` 489, 529) — a
  `/lesson/*` útvonalra nincs szigorú fejléc-CSP.
- Játékok: `TsunamiEscapeEnglish` + `BrainRotSteal` a `useCouponSession`
  motoron (2-2 hivatkozás); `SpaceAsteroidQuiz` + `BlockCraftQuiz` 0 — a D3
  sorrend (Tsunami → BrainRot → **Space → BlockCraft**) éppen ide ér.
- TTS: `speechSynthesis`/`SpeechSynthesis` nulla találat a fában — zöldmező.

## Cél

1. **8 animate + 3 try blokkfajta renderelése** a Lesson Runtime-ban, korosztály-
   sávnak megfelelően, 360×740-en használható mérettel (44 px célok).
2. **Animator lépés a pipeline-ban**: a lecke vázlat `animationSuggestions`-jaiból
   `animate` blokkokat generál, INVARIÁNSOKKAL — új fogalom-id nem születhet,
   blokk nem tűnhet el, nem-animate blokk nem módosulhat, a D1-részhalmaz-tulajdonság
   megmarad. Ugyanaz a fail-closed minta, mint a LS-2c lépéseinél.
3. **Szigorú CSP a `/lesson/*` útvonalon** (fejléc-szinten): nincs
   `'unsafe-inline'`/`'unsafe-eval'` a `script-src`-ben — a lecke adat, nem program
   (LS-2 indoka), ezt a fejléc is kikényszeríti.
4. **TTS**: a `readAloud: true` magyarázat-blokkok felolvasása `speechSynthesis`-szel,
   kizárólag felhasználói gesztusra (autoplay-policy), `reduced-motion` mellett némán.
5. **Space + BlockCraft a közös motoron** (`useCouponSession` + `CouponHud`),
   ugyanúgy, ahogy a Tsunami/BrainRot már rajta van (D3).

## Nem-cél

- Új játéktípus, új kupon-szabály, a D2 létra módosítása.
- Az admin Studio kliens-képernyői a pipeline-hoz (külön felületi szelet).
- A generált HTML meta-CSP-jének átírása (örökölt anyagok — külön ticket).
- Lighthouse-eredmény „javítgatása": a mért értéket rögzítjük, nem gyártjuk.

## Érintett fájlok (terv, a megvalósítás során verifikálandó)

- `client/src/lesson-runtime/LessonRuntime.tsx` (animate/try ágak) + új
  `client/src/lesson-runtime/blocks/` (8 animáció, 3 gyakorlat komponens).
- `server/studio/step-runner.ts` (animator ág), `server/studio/step-io.ts`
  (`buildAnimatorPrompt`, `ANIMATOR_INVARIANTS` tiszta függvény),
  `server/ai/models.ts` (nincs változás — a modell már deklarálva).
- `server/index.ts` (helmet: `/lesson/*`-ra szigorú CSP-profil).
- `client/src/lib/tts.ts` (új, tiszta modul) + `LessonRuntime` bekötés.
- `client/src/pages/SpaceAsteroidQuiz.tsx`, `client/src/pages/BlockCraftQuiz.tsx`
  (motor-adoptálás, a Tsunami/BrainRot mintájára).

## Edge case-ek

- Animator kimenete üres/hibás JSON → a job `error`, a lecke érintetlen (fail-closed).
- Animator ismeretlen fogalom-idot ad → a lecke érintetlen, az id megnevezve.
- Animator `plannedBlocks`-ben nincs `animate` → nincs mit csinálni, a lépés no-op-pal
  továbbenged (nem hiba: a vázlat döntött).
- `readAloud: false` / `reduced-motion` / nincs felhasználói gesztus → TTS némán kihagy.
- A szigorú CSP alatt a lecke-oldal betöltése funkcionális marad (e2e bizonyítja).

## EARS elfogadás

- When the runtime receives an `animate` block, it shall render one of the 8 planned
  kinds with a reduced-motion static frame as fallback, and no horizontal overflow at
  360 px viewport width.
- When the runtime receives a `try` block, it shall render one of the 3 planned kinds
  and grade it locally.
- When the animator step runs, the produced lesson shall contain no concept id absent
  from the map, shall keep every pre-existing block, and shall differ from the input
  only in blocks the outline planned as `animate`.
- While the animator violates any invariant, the job shall go `error` and the stored
  lesson shall stay unchanged.
- When a request hits `/lesson/*`, the response shall carry a CSP whose `script-src`
  excludes `'unsafe-inline'` and `'unsafe-eval'`.
- When `readAloud` is false or the user has not interacted, the TTS layer shall never
  call `speechSynthesis.speak`.
- When Space or BlockCraft is played with an active coupon, the coupon clock shall run
  exactly as it does in Tsunami and BrainRot.

## Névvel megjelölt RED tesztek (a kód előtt, ebben a sorrendben)

1. `tests/animator-invariants.test.ts` — tiszta függvény: (a) új id nincs; (b) blokk
   nem tűnik el; (c) nem-animate blokk bájtra azonos; (d) `lessonIdsSubsetOfMap`
   igaz marad; (e) hibás JSON → hiba-eredmény, lecke érintetlen.
2. `tests/csp-lesson-route.test.ts` — a `/lesson/*` route-hoz tartozó CSP-profil
   `script-src`-je nem tartalmazza az `'unsafe-inline'`/`'unsafe-eval'` szavakat;
   a többi útvonal profilja változatlan.
3. `tests/animate-try-kinds.test.ts` — statikus őr (a `screens-defined` mintájára):
   minden `ANIM_KINDS` és `TRY_KINDS` értékhez létezik renderelő ág/komponens a
   runtime-ban.
4. `tests/tts-guard.test.ts` — `readAloud: false` és gesztus nélkül nincs `speak`
   hívás; a tiszta `tts.ts` modul döntési logikája tesztelhető DOM nélkül.
5. e2e (`websuli.spec.ts` bővítés): animáció statikus képkocka reduced-motion alatt,
   try-blokk interakció; Space/BlockCraft kupon-óra füstteszt.
6. Lighthouse a11y ≥ 90 a `/lesson/:id`-n — a MÉRT érték kerül a PR-be (ha < 90,
   az is), nem kozmetikázva.

## Verifikáció

```bash
npm run verify   # check + lint(0) + test + build
npm run test:e2e # Playwright
npx lighthouse <lesson-url> --only-categories=accessibility --output=json   # a11y jegyzőkönyv
```

## Kockázatok / nyitott kérdés

- **Stacking:** az LS-2c merge nélkül az animator ág annak branch-ére épül — a PR
  base-e a prior ág, sorrendben merge-ölni (vertical-slice-delivery stacked-PR
  fejezete szerint).
- A Space/BlockCraft motor-adoptálása játékbelső állapotot érint — a játékok
  viselkedés-tesztje (game-engine.test.ts) a regresszió-őr.
- Lighthouse futásához élő szerver + valós lecke kell; ha a böngésző-feltételek
  hiányoznak, a mérést NOT RUN-ként jelentjük okkal, nem pótoljuk számmal.
