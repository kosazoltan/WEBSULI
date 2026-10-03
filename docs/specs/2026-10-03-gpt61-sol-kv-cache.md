# GPT-6.1 Sol modellváltás + KV-cache maximalizálás (2026-10-03)

Tulajdonosi utasítás (2026-10-03): ahol GPT-6 Astra vagy GPT-5.6 Sol fut, ott saját OpenAI-kulccsal GPT-6.1 Sol fusson; minden
ügynök a lehető legjobban használja ki a KV-cache-t (prompt caching) a tokenköltség csökkentésére.

## Mért állapot
- `server/ai/models.ts`: `htmlFixStream`, `analyzeFiles`, `chatgptChat` = `gpt-5.6-sol` (OpenAI, saját kulcs). Astra a WEBSULI-ban nincs.
- `gpt-6.1-sol` élő API-hívással ellenőrizve (2026-10-03): elérhető, a cache automatikus (≥1024 tokenes azonos előtag,
  `prompt_tokens_details.cached_tokens`), `prompt_cache_key` nem kell. Az OpenAI-ágon a teendő: a változó adat a prompt VÉGÉN legyen.
- Anthropic (Opus 5, cache-minimum 512 token): explicit `cache_control` kell. A pipeline (`run-step.ts`, `ClaudeProvider.chat`) már
  használja; a régi útvonalak nem:
  - `routes.ts` htmlFix / htmlTheme: a felhasználói egyedi utasítás a statikus szöveg KÖZEPÉN, nincs töréspont.
  - `routes.ts` claudeChat és claude-html: a 27 ezer karakteres v7.4 spec ELŐTT a leckénként változó téma (és claude-html-nél a
    teljes szöveges tartalom + metadata) áll → a spec soha nem cache-találat; a többkörös beszélgetés sem cache-elt.
  - `improveAsync.ts`: a spec előtt a változó téma; `ClaudeProvider.streamChat` nem tesz töréspontot; a csonka-kimenet folytatása
    a teljes (óriási) user-promptot újraküldi cache nélkül.
  - `web-research-runner.ts`: a töréspont az egész (címtől függő) rendszerprompton → csak azonos címnél talál; a `pause_turn`
    folytatások a letöltött oldalakat cache nélkül küldik újra.
  - `gameQuizGeneratorService.ts`: statikus rendszerprompt töréspont nélkül.
  - `routes.ts` chatgptChat (OpenAI): az évfolyam a statikus prompt közepén.

## Cél
1. Modell: a három `gpt-5.6-sol` hozzárendelés → `gpt-6.1-sol` (+ `MAX_OUTPUT_BY_MODEL`), tesztek a tulajdonosi döntés szerint.
2. Közös modul `server/ai/prompt-cache.ts`: `cachedSystem(static, dynamic)` és `claudeSystemFromMessages` / `cacheConversation`.
3. `lessonHtmlSpecParts` — a spec statikus része és a téma külön; `lessonHtmlSpecPrompt` kimenete változatlan.
4. A fenti híváshelyeken: statikus rész elöl `cache_control`-lal, változó adat utána; a többkörös/folytatásos hívásoknál
   a beszélgetés is cache-elt (kérés-szintű `cache_control`, illetve a folytatásnál az első user-üzenet töréspontja).

## Nem-cél
A pipeline (`run-step.ts`) meglévő cache-elése; a promptok tartalma (csak a sorrend változik); Hermes; más repók (külön PR).

## Edge case
- Rövid (minimum alatti) előtag: a szolgáltató egyszerűen nem cache-el (nem hiba).
- Max. 4 töréspont/kérés: legfeljebb 2-t használunk.
- OpenAI-szolgáltatók: több system-üzenet sorrendben megy át, az előtag-sorrend ugyanaz.

## Elfogadás (EARS)
- HA egy útvonal Anthropic-hívást tesz statikus rendszerprompttal, AKKOR a statikus rész az első, `cache_control`-os blokk, és
  téma/cím/tartalom/metadata/egyedi utasítás nem szerepel benne (forrás- és unit-teszt).
- HA az improve folytatást kér, AKKOR az első user-üzenet `cache_control`-os.
- `lessonHtmlSpecPrompt` kimenete bájtra azonos a `theme + "\n\n" + spec` összefűzéssel.
- tsc, lint, teljes unit és a rögzített futások visszajátszása zöld.
