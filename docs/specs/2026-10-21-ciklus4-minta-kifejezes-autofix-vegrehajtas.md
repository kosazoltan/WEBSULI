# Ciklus 4 — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix.md`.

1. **`server/studio/tools/bank-packet-autofix.ts`:** `fixTypedValues(task, fixes)` — szám → `String(value)`.
2. **`server/studio/experience-builder.ts`, a minta-ellenőrzés üzenete:** + a mintából pontosan hiányzó `requiredPhrases` csoportok és a
   `requiredOrder`-eltérés.
3. **Teszt:** `tests/ciklus4-minta-kifejezes-autofix.test.ts`.
