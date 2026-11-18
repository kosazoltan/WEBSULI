# Szólétra olvashatóság — követő javítás (terv)

**Dátum:** 2026-11-18 · **Kanban:** #89 · **Ág:** `fix/szoletra-kovetes` (a `fix/szoletra-olvashatosag` `69547067` fejéről)
**Előzmény:** [`2026-11-17-szoletra-olvashatosag.md`](2026-11-17-szoletra-olvashatosag.md), PR #498 két review-lelete.
**Végrehajtás:** [`2026-11-18-szoletra-kovetes-vegrehajtas.md`](2026-11-18-szoletra-kovetes-vegrehajtas.md)

## Cél

1. **R1 (Codex P2, #498 `sim.ts:292`):** ha a menet nyitott kérdés közben ér véget, a sim statisztikája (`stats()`) a
   megszakított kérdés KEZDETÉN veszi a pillanatképet → a menetidő és a kérdés / perc torzul. Mérve (seed 3, 4. évf., kérdéssel,
   Nyugodt, válasz nélkül): `simTimeMs` 482,98 s, de `stats().simSeconds` 472,75 s; kérdés / perc 3,046 (helyesen 2,981). Csak
   mérési torzítás. Javítás: a pillanatkép a menet valódi végén; a megszakítás pillanatára csak a „kérdés nélküli szakasz”
   (`maxGapSec`) igazodik (a megszakított kérdés nyitott ideje nem rés — a közös `runStats` saját definíciója szerint).
2. **R2 (Vercel, #498 `WordLadderHuEn.tsx:1717`):** hosszú válaszoknál (`.wl-answers[data-long="true"]`) a specifikusabb
   szabály felülírja a helyhiány miatti tömör fogás-panelt (`[data-fit="2"]`), így a 3. lépcső hatástalan; keskeny, alsó
   biztonsági sávos nézetben a megoldás-kártya takarhatja az első válasz feliratát. Mérés böngészőben (360×640, alsó
   biztonsági sáv, hosszú válaszok, képernyőkép); ha valódi: a tömör szabály a `data-long` esetet is fedje.

## Nem cél

A közös `questionDirector` / `runStats` módosítása (jegy); más játék.

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] R1 WHEN a menet nyitott kérdés közben ér véget THEN the system SHALL a `stats().simSeconds`-t a menet valódi végén,
  a `maxGapSec`-et a nyitott kérdés nélkül adni (teszt + mutációs ellenpróba).
- [ ] R2 WHEN a fogás-panel tömör (`data-fit="2"`) és a válaszok hosszúak THEN the system SHALL a tömör stílust alkalmazni, és a
  kérdés-kártya alsó biztonsági sávos 360×640-es nézetben sem fedi a fogásokat (e2e + képernyőkép + mutációs ellenpróba).
