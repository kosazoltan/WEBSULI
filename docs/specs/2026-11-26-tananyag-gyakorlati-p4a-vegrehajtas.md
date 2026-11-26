Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` (PR 4 — Aránytervezés és tartalmi kapu a Stúdióban; első rész: meta-kapu)

# Végrehajtás — TG-P4a: meta-kapu a bankcsomag elfogadásán

Tulajdonosi döntés (2026-11-26): a leckébe nem kerülhet a feladatlapra / felvételire vonatkozó kérdés (pontozás, feladattípus,
felépítés). A P3 a promptban tiltja, a P1 méri (élő állomány: 10 leckében 17 kvíz + 8 nyílt meta-tétel). A P4a a GYÁRTÁS kapuján
utasítja el: a bankcsomag `validate`-je (`experience-builder.ts`) a meta-tételt javító fordulóra küldi.

1. `shared/practice-policy.ts`: `practiceMetaProblems({ quiz, tasks })` — tételenként `quiz[i]` / `tasks[i]` + ok + teendő.
2. Bekötés: a bankcsomag-validátor `problems` listája (a meglévő ellenőrzők mellé); a mentett leckék olvasását nem érinti.
3. Bukó teszt: `tests/practice-policy.test.ts` — meta-kvíz és meta-nyílt feladat problémát ad, a gyakorlati / fogalmi nem;
   a validátor a `practiceMetaProblems`-t hívja.
4. Az arány (60–75%) kapuja a P4b (bank-kvóta és kiadási kapu).

Állapot: TG-P4a 1/3 egység kész — következő: bukó teszt
