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
