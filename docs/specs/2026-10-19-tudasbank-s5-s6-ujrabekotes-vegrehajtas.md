# Tudásbank S5/S6 újrabekötése — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes.md`. Munkakönyvtár: `source/`. Ág: `feat/tudasbank-s5-s6-bekotes`.

1. **`server/catalog/s6-context.ts`:** visszaállítás a `git show d9e9c8e9^:source/server/catalog/s6-context.ts` tartalmával.
   Az importok ellenőrzése (`subjectKeyOf`, `subjectSkillBlock`, `retrieval`), a változatlanság a cél.
2. **`server/studio/pipeline-store.ts`:**
   - **A `PipelineStore` típusa** két opcionális metódust kap:
     - `loadCatalogRows?(subject: string): Promise<CatalogRowLike[]>`;
     - `loadSubjectMemory?(subject: string): Promise<MemoryCard[]>`.
   - **A Drizzle-megvalósításban** ugyanazok a lekérdezések, mint a d9e9c8e9 előtti `step-runner.ts`-ben:
     - katalógus: `catalogItems` (`subject = $1`, `status = 'active'`, ugyanazokkal a mezőkkel);
     - memória: `loadSubjectMemoryCards` a `dbPool`-lal (lusta import).
3. **`server/studio/single-run/engine.ts`:**
   - **Két segéd a `runSingleLesson`-ön belül**, az `output` / `save` lezárással:
     - `ensureCatalogPool()`: kapcsoló nélkül `undefined`. Ha a `poolMatches(output.catalog, map)` igaz, a mentett poolt adja.
       Különben `catalogQueryOf` → `store.loadCatalogRows` → `catalogPoolFor` → `output.catalog`, majd mentés és naplósor.
       Hibánál naplósor és `undefined`.
     - `ensureSubjectMemory()`: kapcsoló nélkül `undefined`. A `subjectKeyOf(map.meta.subject)` hiánya → `undefined`. A mentett
       `isMemorySnapshot` újrahasznosul. Különben `memorySnapshot(await store.loadSubjectMemory(subject), subject, Date.now())` →
       `output.subjectMemory`, mentés. Hibánál `undefined`.
     - A `CatalogMapLike` a `map`-ből: `{ meta: { title, subject, classroom }, concepts }`.
   - **`knowledgeBlock(role: "pedagogue" | "author")`:**
     `[catalogS6Enabled() ? planningContextBlock(map, await ensureCatalogPool()) : "", snapshotPromptBlock(await ensureSubjectMemory(), role)].filter(Boolean).join("\n")`.
   - **2. állomás:** a kérés szövegéhez csak NEM üres blokk esetén fűzzük hozzá: `\n${block}` a „Válaszolj kizárólag…” sor
     ELÉ. A blokk csak akkor számolódik, ha a tervező valóban fut.
   - **3. állomás:** az `authorRequest` szövegéhez ugyanígy fűzzük. A blokk egyszer számolódik a 3. állomás előtt, a javító
     körök ugyanazt kapják.
   - **`buildBank`:** `...(pool ? { catalog: pool } : {})` és
     `...(memoryBlock ? { memory: memoryBlock } : {})`, ahol `memoryBlock = snapshotPromptBlock(await ensureSubjectMemory(), "bank")`.
4. **`tests/single-run-knowledge.test.ts` (új):** a `tests/single-run-engine.test.ts` forgatókönyves modelljével és
   memóriabeli store-jával, a store-on betöltőkkel, amelyek számolják a hívásaikat.
   - **Kikapcsolva:** a betöltők 0-szor hívódnak. A 2. és 3. állomás kérésének szövege azonos egy betöltők nélküli store-ral
     futtatott referenciafutáséval.
   - **`STUDIO_CATALOG_S6=1`:**
     - a 2. és 3. kérés tartalmazza a „TANTÁRGYI KATALÓGUS — MINTÁK” blokkot;
     - a katalógus-betöltő pontosan 1-szer fut;
     - a mentett lépések egyikében van `output.catalog`;
     - a bank rendszerpromptja (friss beszélgetés) tartalmaz katalógus-szöveget (vagy a bankhívás egy azonosító részletét).
   - **`STUDIO_SUBJECT_MEMORY=1`** egy nyitott kártyával: a 2. és 3. kérés tartalmazza a „TANTÁRGYI MEMÓRIA” blokkot, és az
     `output.subjectMemory` mentve van.
   - **A betöltő dob:** a futás közzétesz, a naplóban ott a hiba.
   - **A kapcsolók visszaállítása** `finally`-ben.
5. **Ellenőrzés:**
   - `npm.cmd run check`, `npm.cmd run check:test`, célzott eslint;
   - a célzott teszt és a `tests/single-run-engine.test.ts`;
   - `npm.cmd test`, majd `npm.cmd run build`.
6. **Reverz mutáció:** a 3. állomás blokk-hozzáfűzésének kivétele → az S6-teszt bukjon.
