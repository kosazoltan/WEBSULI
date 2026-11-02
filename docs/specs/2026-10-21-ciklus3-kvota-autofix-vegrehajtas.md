# Ciklus 3 — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus3-kvota-autofix.md`.

1. **`server/studio/tools/bank-packet-autofix.ts`:** `fixDistinct(task, fixes)` a `fixTask` előtt (kanonikus alak: kisbetű, ékezet nélkül).
2. **Teszt:** `tests/ciklus3-kvota-autofix.test.ts` — ismétlődés, `count`-szorítás, üres `required`, kvóta nélkül érintetlen.
