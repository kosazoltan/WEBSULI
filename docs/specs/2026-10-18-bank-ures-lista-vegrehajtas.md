# Gyakorlóbank: üres választható lista — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-bank-ures-lista.md`. Munkakönyvtár: `source/`.

1. **`server/studio/bank-schema.ts` `normalizeStrictPacket`:** a `strip`-ben a `null` mellett az üres lista is kimarad, ha a kulcs
   `OPTIONAL_ARRAY_KEYS` (`typedAnswers`, `requiredDistinct`, `options`, `steps`) eleme. A kvíz `options` kötelező, ezért csak a
   `methods` és a `tasks` bankon.
2. **`server/studio/tools/bank-packet-autofix.ts`:**
   - `tasks`: üres `typedAnswers` / `requiredDistinct` törlése (`fixes` bejegyzéssel);
   - `methods`: üres `options` / `steps` törlése.
3. **Tesztek** (`tests/bank-empty-optional.test.ts`):
   - a képernyőképen látott alak (3 feladat, mindkét mező `[]`) a `normalizeStrictPacket` után átmegy a helyi feladatsémán, és a
     mezők hiányoznak;
   - az `autofixBankPacket` ugyanígy tisztít, és naplózza;
   - a kötelező `required: []` továbbra is sémahiba;
   - a kitöltött `typedAnswers` érintetlen.
4. **Ellenőrzés:** `tsc`, `check:test`, `eslint`, `npm.cmd test`.
