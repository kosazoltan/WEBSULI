# A levágott modellválasz megszüntetése — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-bank-kimeneti-keret.md`. Munkakönyvtár: `source/`. Ág: `fix/bank-kimeneti-keret`.

1. **`server/studio/single-run/conversation.ts`:**
   - `SINGLE_RUN_MAX_TOKENS = 128_000`;
   - megjegyzés: a modell plafonja, csak a generált token fizetendő; a levágás a kifizetett kimenetet eldobja.
2. **`shared/lesson-experience.ts` `bankPacketContract`:** új 9. pont („KIMENETI KERET”):
   - a csomag tételszáma (methods ≥ M, tasks N, quiz K);
   - tételenkénti hosszkeret;
   - a gondolkodás ne írja meg előre a csomagot; a JSON egyszer.
3. **Telemetria:**
   - `shared/run-telemetry.ts` `RunGates.outputTruncated?: number` + nézetsor;
   - `server/studio/single-run/telemetry.ts` `emptyGates`;
   - `server/studio/single-run/engine.ts`: a `freshBankCall` / `freshJsonCall` / a fő forduló levágásakor `+1`.
4. **Teszt:**
   - a szerződés tartalmazza a keretet és a tételszámot;
   - a korlát 128 000, és nem nagyobb a modell plafonjánál (`maxOutputForModel`);
   - a levágott bankválasz növeli a számlálót;
   - a meglévő tesztek zöldek.
5. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
