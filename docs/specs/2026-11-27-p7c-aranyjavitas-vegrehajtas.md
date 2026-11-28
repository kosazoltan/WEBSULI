# P7C-ARANYJAVITAS — végrehajtás (2026-11-27)

Terv: `docs/specs/2026-11-27-p7c-aranyjavitas.md`.

1. RED (`source/tests/practice-ratio-repair.test.ts`):
   - `practiceRatioRepairIssues(packet, conceptIds)`: kvóta alatti kvíznél pontosan `goal − alkalmazás` fogalmi tételre ad tétel-szintű
     problémát (`<id>: …`), fogalmanként legalább egy felidéző tétel marad; kvótán belül / felett üres; nyílt feladatra ugyanígy.
   - a csak-bank javítás (`keepLegacy`) kvóta alatti, egyébként hibátlan régi csomagnál célzott kört indít (egy modellhívás, csak a
     kiválasztott tételek cserélhetők); a szerzői javítás viselkedése változatlan.
2. Kód: `shared/practice-policy.ts` (`practiceRatioRepairIssues`), `server/studio/experience-builder.ts` (a `keepLegacy` ágban a
   kvóta-problémánál a kiválasztott tételek a célzott körbe kerülnek).

Elfogadás: a 10 leckés próbán a változatlanul hagyott leckék gyakorlati aránya nő; az érintetlen tételek azonosítója marad.
