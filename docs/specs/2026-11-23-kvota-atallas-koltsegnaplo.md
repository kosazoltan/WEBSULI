# Terv — a kvóta-átállás (OpenAI → OpenRouter) minden váltása költségnaplóba kerül

Tulajdonosi döntés (2026-11-23, kanban #10): kimerült OpenAI-keretnél a Studio OpenRouterre vált (`withQuotaFailover`,
`QuotaFailoverProvider`) — a tartalék MARAD, de MINDEN váltást költségnaplózni kell.

## Tény (a kódból, `origin/main` ccc5e99f)

- `source/server/ai/studio-provider.ts`: két átállási út, közös 10 perces memóriával (`quotaExhaustedUntil`):
  - `QuotaFailoverProvider.chat` / `.streamChat` — a `createStudioProvider` minden közvetlen OpenAI-modellre ezt adja, ha van
    `OPENROUTER_API_KEY`;
  - `withQuotaFailover(connection, run)` — nyers SDK-klienses hívókra (ma nincs éles hívója, csak teszt: `tests/quota-failover-direct.test.ts`).
- Ma naplózva: csak az ELSŐ váltásnál egy szabad szöveges `logger.warn` („kerete elfogyott … OpenRouteren át”). A memória
  alatt OpenRouterre terelt további hívások nyomtalanok; token/költség egyiknél sincs.
- Meglévő költség-/használati mechanizmus: nincs USD-alapú költségkövető és nincs külön használati tábla. A futásonkénti
  tokenkönyvelés a munkafolyamat-motor: `workflowUsage()` (`source/server/workflows/engine.ts`) a futás aktuális látogatására
  (`WorkflowVisit.tokensIn/tokensOut/cacheReadTokens/cacheWriteTokens`) írja a tokeneket, a futás nézete (`WorkflowView`) a
  tárolóba mentődik (jsonb, „a költségmérés ebből számol”). A tokenek itt szolgáltató-függetlenek: a tartalékhívás tokenje
  ma az OpenAI-modellnek látszik, és nincs megjelölve.

## Döntés

1. Új modul `source/server/ai/quota-failover-log.ts`: `recordQuotaFailover(event)` minden TARTALÉKRA terelt hívásnál —
   a váltáskor (`trigger: "quota-error"`) és a memória alatt (`trigger: "memory"`) is:
   - egysoros, strukturált napló: `[AI][quota-failover] {json}` (`logger.warn`);
   - folyamaton belüli telemetria-számlálók (`quotaFailoverCounters()`): váltások, tartalékhívások, bukott tartalékhívások,
     bemeneti / kimeneti tokenek;
   - a meglévő munkafolyamat-könyvelés (`workflowQuotaFailover`): ha a hívás egy futásban történik, a futás nézetébe
     `quotaFailovers` (utolsó 50 esemény) és az aktuális látogatásba `failover: { provider: "openrouter", calls, tokensIn,
     tokensOut }` — így a látogatás tokenjeiből látszik, mennyi ment OpenRouteren át, átállás-jelöléssel.
2. Esemény-mezők: `at` (ISO időbélyeg), `from: { provider: "openai", model }`, `to: { provider: "openrouter", model:
   "openai/<modell>" }`, `reason: "quota"`, `trigger`, `path` (`provider` | `direct`), `ok`, `tokensIn`, `tokensOut`,
   `cachedTokens` (ha a válasz adja), bukásnál `error` (csak a hibaosztály neve). Kulcs, URL-paraméter, üzenetszöveg NEM kerül bele.
3. Streamelt memória-út (`streamChat`): az esemény rögzül, tokenek nélkül (a stream-darabok nem hordoznak használatot).
4. `withQuotaFailover`: az eredményből a tokeneket az OpenAI SDK alakjaiból olvassa (`usage.prompt_tokens/completion_tokens`
   vagy `input_tokens/output_tokens`), ha vannak.
5. A könyvelés hibája (pl. elveszett futás-bérlet) NEM töri el a modellhívást: a napló + számláló megmarad, a hiba figyelmeztetés.

## Nem-cél

- Nincs DB-migráció, nincs új tábla, nincs USD-árazás (árlista nincs a repóban).
- Az átállási viselkedés (mikor, hova, meddig) nem változik.
- Nincs új admin-végpont a számlálókhoz.

## Edge case-ek

- Futáson kívüli hívás (pl. döntőbíró, okosítás külön út): csak napló + számláló.
- A tartalékhívás is bukik: esemény `ok: false`, `error: <osztálynév>`, a hiba továbbmegy.
- Nem-kvóta hiba: nincs váltás, nincs esemény.

## Elfogadás (EARS)

- [ ] E1 WHEN az OpenAI-hívás kvótahibával bukik és a tartalék OpenRouter-hívás sikerül THEN a rendszer SHALL egy
  `trigger: "quota-error"` eseményt rögzíteni a tartalékhívás tokenjeivel, `to.provider = "openrouter"`.
- [ ] E2 WHILE a 10 perces memória él WHEN egy hívás közvetlenül a tartalékra megy THEN SHALL `trigger: "memory"` eseményt rögzíteni.
- [ ] E3 WHEN a hívás munkafolyamat-futásban történik THEN a futás nézete SHALL tartalmazni a `quotaFailovers` eseményt, és az
  aktuális látogatás `failover` mezője SHALL a tartalék tokenjeit hordozni.
- [ ] E4 THE napló és az esemény SHALL NOT tartalmazni API-kulcsot.
- [ ] E5 WHEN a hiba nem kvótahiba THEN SHALL NOT esemény rögzülni.
