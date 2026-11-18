# Szólétra követő javítás — végrehajtási utasítás (AI-ügynöknek)

**Terv:** [`docs/specs/2026-11-18-szoletra-kovetes.md`](2026-11-18-szoletra-kovetes.md). **Állapot:** folyamatban — ág
`fix/szoletra-kovetes`, munkafa `.claude/worktrees/szoletra-kovetes`, kanban #89.

## Lépések

1. Docs-commit (ez + a terv).
2. **R1:** `source/client/src/lib/wordLadder/sim.ts` `stats()`: `{ ...director.stats(t), maxGapSec: director.stats(abortedAt).maxGapSec }`
   ha volt megszakított kérdés; teszt a `source/tests/word-ladder-sim.test.ts`-ben (seed 3, 4. évf., Nyugodt, válasz nélkül:
   `simSeconds` = `simTimeMs` / 1000, `maxGapSec` ≤ 8); mutációs ellenpróba (a régi `stats(abortedAt ?? t)`-vel bukik).
3. **R2:** mérés böngészőben (`source/tests/word-ladder-readability.spec.ts` új eset: 360×640, alsó biztonsági sáv
   (`--game-safe-bottom` felülírva), hosszú válaszos tételek, kérdés- és megoldás-állapot, képernyőkép a
   `docs/measurements/jatekok-jatekelmeny/J2-olvashatosag/` alá; állítás: a tömör panelen a fogás-felirat 16 px, a kártya nem fed);
   javítás a `source/client/src/pages/WordLadderHuEn.tsx` stílusában (a tömör szabály a `data-long` esetet is fedje);
   mutációs ellenpróba.
4. `gate:stage` szakaszonként; böngészős futás E2E-sorompóval, `--workers=1`. Push nincs (orkesztrátori jelre).

## Mért számok (2026-11-18)

- **R1 — valódi (csak mérési torzítás):** seed 3, 4. évf., kérdéssel, Nyugodt, válasz nélkül: javítás előtt `stats().simSeconds`
  472,75 s (a menetidő 482,98 s), kérdés / perc 3,046; javítás után a statisztika a menet végén (482,98 s, 2,981 / perc), a
  `maxGapSec` 3,02 s (a nyitott kérdés ideje nem rés). Új teszt a `word-ladder-sim.test.ts`-ben — a javítás előtt bukott.
- **R2 — valódi:** 360×640, `--game-safe-bottom: 34px`, hosszú válaszos tételek. Javítás előtt a tömör fogás-panel stílusa a
  `data-long` szabály miatt nem hatott (felirat 17–18 px), és a kártya fedte a fogásokat: `en4-family-006` kérdés −9 px,
  megoldás −3 px; `en4-health-016` kérdés −2 px. Javítás után (a tömör szabály a `data-long` esetet is fedi): rés
  `en4-family-006` 15 / 21 px, `en4-health-016` 21 / 29 px, `en4-health-023` 39 / 37 px; a tömör panelen a felirat 16 px; e2e
  `R2 @ 360x640 alsó biztonsági sávval` zöld; képernyőkép: `docs/measurements/jatekok-jatekelmeny/J2-olvashatosag/r2-360x640-also-sav.jpg`.
