# Brain Rot — több idő a válaszadásra (végrehajtási utasítás, ügynöknek)

Terv: `docs/specs/2026-11-17-brainrot-valaszido.md` ([link](2026-11-17-brainrot-valaszido.md)). Ág `fix/brainrot-valaszido` (friss
`origin/main`), munkafa `.claude/worktrees/brainrot-valaszido`. Push NINCS — fej-hash, mérőtábla, képek az orkesztrátornak.

## Lépések

1. `source/client/src/lib/brainRot/pacing.ts` (új, tiszta modul — nincs DOM, React, óra, `Math.random`):
   - `brainRotWpm(grade)`, `brainRotFullReadMs(prompt, options, grade)`, `brainRotWindowMs({ prompt, options, grade })` a
     terv D1 képletével; konstansok: `BR_ORIENT_MS = 1000`, `BR_DECIDE_MS = 2000`, `BR_DECIDE_YOUNG_MS = 2500`,
     `BR_MOVE_MS = 1800`, `BR_WINDOW_MIN_MS = 9000`, `BR_FLOOR_FACTOR = 1.25`, `BR_WINDOW_MAX_MS = 30_000`,
     `BR_LEAD_IN_MS = CAGE_ARM_MS`.
   - `paceBrainRotDirector(base, { grade })`: a director `tick` / `request` / `active` presentation-jét burkolja
     (`startedAtSimMs + BR_LEAD_IN_MS`, `windowMs = brainRotWindowMs`); kérdésenként azonos identitás; minden más
     metódus a base-é (a director nem változik).
2. Lap (`P/BrainRotSteal.tsx`): `useQuestionDirector(setup)` → `paceBrainRotDirector` (memo a director-példányra) →
   `usePlayQuestion({ director: paced, … })`; új menetnél a saját `reset` (`own.reset(seed, band)`), a sáv a director-cserére
   magától tisztul.
3. Sim (`L/brainRot/sim.ts`): ugyanaz a burkoló a sim directorára (K.6: a lap és a sim ugyanazt hajtja).
4. Tesztek:
   - `tests/brainrot-pacing.test.ts`: rövid / hosszú, alsó és felső korlát, a mostani ablak 1,25-szöröse, monotonitás a
     szöveghosszban, évfolyam; a burkoló: az óra 600 ms-mal később indul, az ablak a `brainRotWindowMs`, azonos identitás,
     a director többi része érintetlen.
   - sim: a meglévő tesztek zöldek (J2, J3, K1, K2, Ú1, Ú4, V1, determinizmus); plusz: a sim presentation-je a burkolt ablakot
     kapja.
   - e2e (`brainrot-play.spec.ts`, 390 × 844, valódi érintés): `quiz-longboth` → a lapon belül a kérdés-órán megvárja a
     teljes szöveg 100 szó/perces végigolvasását, majd valódi bökés a jó ketrecre → helyes válasz (nem lejárat); a
     hátralévő idő az első 600 ms-ban nem csökken.
   - mutációs ellenpróba: a burkoló kivételével az e2e és az egységteszt bukik.
5. Kapuk: `npm run gate:stage` szakaszonként; CI-azonos böngészős út a Brain Rot specjeire (E2E-sorompó: ellenőrzés és
   indítás külön lépésben, `--workers=1`); a végén `npm run gate:push`. Előtte / utána képernyőkép (390 × 844, hosszú kérdés,
   a számláló látszik).
6. A régi J10-szám (6 / 7,5 / ≤ 9 s) spec-változását a terv „Spec-változás” szakasza rögzíti; a hullám végrehajtási fájlja
   (`docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`) itt nem módosul (a #483 ugyanott szerkeszt — ütközne).
