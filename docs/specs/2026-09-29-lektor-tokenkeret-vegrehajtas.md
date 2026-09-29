# Végrehajtási utasítás: lektor tokenkeret (2026-09-29)

Terv: `docs/specs/2026-09-29-lektor-tokenkeret.md`. Ág: `fix/lektor-tokenkeret` (alap: `origin/main`).

1. **Teszt ELŐBB:** `source/tests/lektor-request-policy.test.ts` — a `max_output_tokens` elvárása 12000 → 32000
   (dokumentált spec-változás). Futtatás: `node --import tsx --test tests/lektor-request-policy.test.ts`. Elvárt: a
   változás előtt BUKIK („12000 !== 32000”).
2. **Kód:** `source/server/ai/studio-provider.ts`:
   - `export const LEKTOR_MAX_TOKENS = 32_000` a `LEKTOR_TIMEOUT_MS` mellett;
   - a `createStudioStepProvider` lektor-ága ezt használja;
   - a lektor-szabály kommentje a 32k-s keretet és az okát írja le (a régi „≈ 0,4–2k token” állítás elavult).
3. **Kapuk** (`source/`): `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npm run lint`,
   `node --import tsx --test tests/*.test.ts`, `npm run build`. Elvárt: mind zöld.
4. **Élő újramérés** merge és deploy után: a `web-live-mezo-kombi.local.mts` (a füzetfotó és a webes oldalak).
   Elvárt: a lektor-lépés nem csonkul, `done`.
