# Claude-stream: a néma gondolkodás ne számítson tétlenségnek

Dátum: 2026-10-14 · Hatókör: `source/server/ai/ClaudeProvider.ts` (streamelt ág) + teszt.

## Mért hiba

Offline próbafuttatás (`source/scripts/measure/lesson-trial.mts`, élő Anthropic API, 2026-10-14): a szerző lépés
(`claude-opus-5-5`, streamelve) kétszer bukott ~170 s után:

```
StepModelError "author" ... a szolgáltató hibát jelzett ← AIProviderIdleTimeoutError [Claude] No stream data for 120000ms (idle timeout)
```

Ugyanazon a térképen a sikeres szerzőfutások 233–816 s-ig tartottak.

## Ellenőrzött tények (forrásból)

- `server/ai/studio-provider.ts:164` — `STREAM_IDLE_MS = 120_000`; az `author` streamelt lépés (`STREAMED_STEPS`).
- `server/ai/stream-collect.ts` `collectStream` — az őrt csak `text` vagy `activity` esemény indítja újra; az üres `{}`
  esemény szándékosan NEM (Review #190, teszt: `tests/review-190.test.ts` „Sourcery: haladás nélküli …”).
- `server/ai/ClaudeProvider.ts` `chatStreamed` — csak a `text_delta` szöveg, csak a `thinking_delta` aktivitás; minden más
  esemény `{}`.
- A kérés `thinking: { type: 'adaptive' }` (csak ha `reasoningEffort` be van állítva), `display` nélkül. A szerzőnél
  (`claude-opus-5-5`) `MODEL_REASONING_EFFORT` nem ad effortot → a `thinking` mező hiányzik; az Opus 5.5 ekkor is adaptív
  gondolkodással fut (claude-api skill, „Omitting thinking: Runs adaptive”).
- Az Opus 5.5 / Opus 5 / Sonnet 5 alapértelmezett `display` értéke `"omitted"`: a `thinking` blokk üres szöveggel streamel
  (claude-api skill, Thinking display). Tehát hosszú gondolkodás alatt nincs `thinking_delta` szöveg.
- `@anthropic-ai/sdk` 0.123.0 `core/streaming.js:111-113`: `if (sse.event === 'ping') continue;` — a `ping` SSE-esemény
  sosem jut el a `messages.stream` iterátoráig. A „bármely esemény életjel” megoldás ezért egyedül NEM javítaná a hibát:
  „omitted” gondolkodás alatt a kódunk egyetlen eseményt sem kap.
- `ThinkingConfigAdaptive.display?: 'summarized' | 'omitted' | null` (SDK típus, `resources/messages/messages.d.ts`).
  A `display` csak a láthatóságot szabályozza, a gondolkodás és a számlázás ugyanaz (claude-api skill).

## Cél

1. A streamelt Claude-hívás kérjen `thinking.display: "summarized"`-t, így hosszú gondolkodás alatt `thinking_delta`
   (összefoglaló) érkezik, ami a meglévő szabály szerint haladás.
2. A gondolkodás valódi, modell által kibocsátott állapotjelei (`content_block_start` thinking/redacted_thinking blokkal,
   `signature_delta`, `content_block_stop`) is aktivitásnak számítsanak.
3. A valódi elakadás elleni védelem marad: a teljesen néma stream, és a csak üres/metaadat (`{}`) eseményt adó stream
   továbbra is tétlenségi hibával bukik.

## Nem-cél

- `collectStream` szemantikájának módosítása (a `{}` esemény továbbra sem haladás).
- `STREAM_IDLE_MS` emelése (az csak elfedné a hibát, és a valódi elakadást is később fogná meg).
- A `ping` események megszerzése az SDK megkerülésével (a ping szerver-keepalive, elakadt modell mellett is jöhet —
  Review #190 szerint nem haladás).
- A nem streamelt `chat` ág és a `streamChat` módosítása.

## Döntések

- D1: `display: "summarized"` csak a streamelt ágon (`chatStreamed`). A nem streamelt ág változatlan marad.
- D2: Ha a kérés már tartalmaz `thinking` mezőt (`reasoningEffort` be van állítva), ahhoz adjuk a `display`-t. Ha nincs
  `thinking` mező, akkor csak az alapértelmezetten gondolkodó modellcsaládnál (`claude-opus-5*`, `claude-sonnet-5*`,
  `claude-fable-5*`) küldünk `{ type: 'adaptive', display: 'summarized' }`-ot — ez az alapviselkedéssel egyenértékű, csak
  láthatóvá teszi az összefoglalót. Más (régi) modellnél nem küldünk `thinking`-et (régi modell 400-at adhatna).
- D3: A felhasználó által kért „keepalive-only stream nem bukik” tesztet a Claude-szolgáltató szintjén valósítjuk meg
  (gondolkodás-állapotjelek és összefoglaló-delták), mert a `collectStream`-szintű `{}` keepalive-ra a Review #190 teszt
  pont az ellenkezőjét rögzíti, és azt gyengíteni tilos.

## Edge case-ek

- E1: gondolkodás-összefoglaló két delta között > idleMs → továbbra is tétlenségi hiba (valódi szünet; UNVERIFIED, hogy
  élőben a summarized delták milyen sűrűn jönnek — élő mérés NOT RUN, lásd kockázatok).
- E2: csak `ping` jön (az SDK eldobja) → tétlenségi hiba (néma stream).
- E3: a gondolkodás-blokk szövege a `content`-be nem kerül (csak `text_delta` szöveg).
- E4: `redacted_thinking` blokk kezdete is aktivitás.

## EARS elfogadási feltételek

- A1: AMIKOR a `ClaudeProvider` streamelt kérést küld `claude-opus-5-5` modellre `reasoningEffort` nélkül, a kérés törzse
  `thinking: { type: "adaptive", display: "summarized" }`-ot TARTALMAZ.
- A2: AMIKOR `reasoningEffort` be van állítva, a kérés `thinking.type === "adaptive"`, `thinking.display === "summarized"`,
  `output_config.effort` változatlan.
- A3: AMIKOR a stream idleMs-nél hosszabb ideig csak gondolkodás-eseményeket ad (blokk-kezdet, összefoglaló-delták,
  aláírás, blokk-vég), egyenként idleMs-en belül, majd szöveget és `message_stop`-ot, a hívás SIKERES, a tartalom csak a
  szöveg.
- A4: AMIKOR a stream a kezdés után csak `ping` eseményeket ad idleMs-en túl, a hívás `AIProviderIdleTimeoutError`-ral bukik.
- A5: A meglévő tesztek (`tests/review-190.test.ts`, `tests/stream-collect.test.ts`) változatlanul zöldek.
  Dokumentált spec-változás: `tests/studio-provider-policy.test.ts` a pedagógus streamelt kérésében pontosan
  `{ type: "adaptive" }`-ot várt; az elvárás pontosan `{ type: "adaptive", display: "summarized" }` lesz (nem lazítás —
  ugyanaz a `deepEqual`, az új kérés-alakra).
- A6: AMIKOR a modell nem az 5-ös család és nincs `reasoningEffort`, a streamelt kérés NEM tartalmaz `thinking` mezőt.
