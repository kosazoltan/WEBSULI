# Ciklus 5 — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus5-mentes-felkarakter.md`.

1. **`shared/well-formed.ts` (új):** `wellFormed(s)` (a `conversation.ts`-ből áthelyezve, onnan újraexportálva) + `deepWellFormed(v)`
   (rekurzív: string → wellFormed; tömb / sima objektum bejárva; más érintetlen).
2. **`server/studio/pipeline-store.ts` `saveStep`:** `deepWellFormed(patch)` az UPDATE előtt.
3. **`server/catalog/retrieval.ts` `clip`:** `wellFormed((s ?? "").slice(0, n))`.
4. **`server/studio/legacy-migration.ts`:** `jobStillRunning(status, runPhase, jobLeaseAlive)` — hibás fázisnál a „running” job csak a job BÁRMELY futásának élő bérletével fut (a review #350-es folytatás megmarad); a `reconcileLegacy` változatlan.
5. **Teszt:** `tests/ciklus5-mentes-felkarakter.test.ts` — deepWellFormed, clip-szerű vágás, reconcile (error + jobRunning + nincs bérlet → restart).
6. **Ciklus-kapu:** `LEGACY_BATCH_LIMIT` 122 → 127 (a tényleges 122 sorelem + 5; a regi-anyag-studio teszt rögzített értéke ezzel együtt, dokumentált spec-változásként).
