# A fogalomtípus hossza — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-21-fogalom-tipus-hossz.md`. Ág: `fix/fogalom-tipus-hossz`.

1. **`server/studio/single-run/live.ts` `saveSingleRunMap`:** `type: c.type.slice(0, 24)`, `verbatimReason: c.correction?.slice(0, 32) ?? null`.
   A vágás tiszta segédfüggvénnyel (`kmConceptColumns`), tesztelhetően.
2. **`server/studio/legacy-migration.ts`:**
   - tiszta `shouldRequeue(row)`: `status: error`, a hibaüzenet a `km_concepts` beszúrással kezdődik, és nincs `requeued`;
   - a tick elején ezeket feltételes frissítéssel `running`-ra állítja `{ attempt: 0, startedAt: 0, requeued: true }` payloaddal (az
     egyeztetés újrakezdést indít).
3. **Teszt:** a vágás, és `shouldRequeue` (igen / nem / másodszor nem).
4. **Összevonás:** csak a sor végeztével (AKTIV=0, deploy-őr).
