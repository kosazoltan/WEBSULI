# Spec: A tanári kérés forrásból igazolt pontjai kiegészítő fogalmak (nem elakadó közzététel, 6. szelet)

> Dátum: 2026-09-30 · Szerző: Claude (Opus 5.5) · Állapot: JÓVÁHAGYVA (tulajdonosi utasítás: teljes, autonóm végigvitel; élő teszt-gyártás)
> Végrehajtás: `docs/specs/2026-09-30-tanari-keres-forrasbol-vegrehajtas.md`

## Cél
Élő teszt-gyártás (Egyiptom, job 5ca6ab42, 2026-09-30): a tanári kérés 22 pontjából 5 a célzott javítás UTÁN is hiányzott
(írnokok, katonák, múmiakészítés, gízai piramisok, időmérés), pedig a forrás tartalmazta őket. Gyökérok (igazolva): a szerző
csak a tudástár fogalmaiból tanít (D1), a kivonatolás viszont ezekre nem készített fogalmat (pl. c48 csak „papok és a hadsereg
vezetői”). Cél: a hiányzó pont, ha a forrás betűhíven alátámasztja, a job tudástárában kiegészítő fogalom legyen.

## Döntések
- Az ellenőrző a forrásszöveget is kapja (≤ 60 000 karakter); hiányzó pontonként `sourceQuote` (betűhív, ≤ 300 karakter).
- A program a normalizált idézetet a normalizált forrásban keresi (≥ 20 betű/szám); nem egyező idézet → elvetve.
- `instructionConceptsFrom`: `instr-<sha1 8>` azonosító, term = pont, quote = forrás-idézet, `supporting` súly;
  `job.output.instructionConcepts` (összefésülve), a `focusedMapOf` hozzáadja a job tudástárához (a közös térkép érintetlen).
- A szerző, a bank, a lektor és a kapu így a fogalmat a forrás-idézettel látja; a „forrás a mérce” szabály nem sérül.
- Forrás-idézet nélküli hiányzó pont változatlanul figyelmeztetés.

## Elfogadás
- WHEN egy hiányzó pont forrás-idézete betűhív THEN a pont kiegészítő fogalom lesz, és a javító szerző tudástárában megjelenik (idézettel).
- WHEN az idézet nem szerepel a forrásban THEN nincs kiegészítő fogalom.
- Élő mérés (Egyiptom-lecke): 4/4 hiányzó ponthoz betűhív idézet → 4 kiegészítő fogalom.
