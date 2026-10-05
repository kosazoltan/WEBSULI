# Végrehajtás — S10 adatvesztés-mentesség (ügynöknek)

Kutatás (2026-10-05, telepített SDK-forrásból igazolva): openai 6.10.0, @anthropic-ai/sdk 0.123.0. Az SDK `timeout` CSAK a
válasz fejlécéig véd (`openai/client.js:357-377`, `@anthropic-ai/sdk/client.js:663-673`) → a tétlenségi őrt magunk írjuk.
`stream_options.include_usage` → külön záró darab a használattal (OpenAI: üres `choices`; OpenRouter: egy üres delta) —
mindkét alakot kezelni kell. OpenRouter keep-alive kommentjeit az SDK elnyeli (`core/streaming.js:270`) → csak valódi darab
(szöveg VAGY reasoning-delta) indítja újra az őrt. Stream közbeni hiba: `APIError` az iterátorból (`core/streaming.js:49-50`).
Responses-stream: `response.output_text.delta`, `response.reasoning_text.delta`, `response.reasoning_summary_text.delta`,
`response.completed`, `response.incomplete`, `response.failed`, `error` (`openai/resources/responses/responses.d.ts`).
A lektor (grok-4.6, xAI) a Responses API-n fut — a mért időtúllépés ott történt, ezért ez az 1. szeletben van.

## 1. szelet — streamelt hívás tétlenségi őrrel (OpenRouter + OpenAI-kompatibilis: chat és Responses)
1. `server/ai/stream-collect.ts`: `collectStream(events, { idleMs, abort, provider })` → `AIResponse`; minden eseménynél
   (szöveg vagy aktivitás) újrainduló őr; tétlenségnél `abort()` és `AIProviderIdleTimeoutError` (részleges szöveggel); egyéb
   hibánál a hiba `partialContent`-et kap. `AIProviderError.partialContent?: string`.
2. `ChatCallOptions.stream?: { idleMs: number }`; `IAIProvider.supportsStreamingChat?: boolean`.
3. `OpenRouterProvider.chat` / `OpenAIProvider.chat` (chat és Responses mód): `options.stream` esetén ugyanazok a paraméterek
   + `stream: true` (+ `stream_options.include_usage` a chat-útnál); a leképezett hiba megtartja a részleges szöveget.
   `QuotaFailoverProvider`: a képességet és az opciót továbbadja. Claude: ebben a szeletben nem streamel (képesség hamis).
4. `studio-provider.ts` `StepPolicy.streamIdleMs` (hosszú lépések: bank, author, lektor, animator, visuals, visualDesigner,
   gateHelper, quizPolish, textFix: 120 000 ms); `stepStreamIdleMs(policy)`.
5. `run-step.ts` `callUncachedStepModel`: ha a szabályzatnak van `streamIdleMs`-e ÉS a szolgáltató tud streamelni → `stream`
   opció, a teljes határidő a régi kétszerese (felső plafon); különben változatlan. Hibánál a részleges szöveg hossza és eleje
   naplóba (`logger.warn`), a hiba-osztályozás változatlan.
6. Tesztek (`tests/stream-collect.test.ts`): gyűjtés (szöveg, záró usage mindkét alakban, finish), tétlenség → hiba részleges
   szöveggel, csak-reasoning aktivitás újraindítja az őrt, stream közbeni hiba részleges szöveggel; OpenRouter és xAI-Responses
   `fetch`-mockolt SSE-vel (teljes folyam és megakadó folyam); run-step: a stream opció csak képes szolgáltatónál és hosszú
   szabályzatnál megy, egyébként a hívás bájtra a régi.

## 2. szelet — automatikus folytatás szerver-újraindulás után
`closeOrphanedStudioJobs` (`lesson-pipeline-routes.ts:137`): a workflow-futással rendelkező árva job nem hibára zárul, hanem a
meglévő folytatási úton (`driveTracked(..., start=false)`, `/jobs/:id/resume` logikája) indul újra a futás gazdájával
(`lesson_workflow_runs.owner_id`), futásonként legfeljebb 2 automatikus folytatással (számláló a pillanatképben); efölött a
régi hibaüzenet. Teszt: tiszta döntő függvény (folytat / lezár) + a számláló.
Review #191 (spec-változás, ld. a spec „Spec-változás” szakaszát): lejárt lízing + futó workflow + elfogyott keret → `close`
AZ IDŐSZAKOS söpréskor is (nem `leave`); a lezáró UPDATE `ne(studioJobs.status, "ok")` őrrel. Teszt: `tests/orphan-sweep.test.ts`
(a korábbi `leave` állítás `close`-ra változik + új teszt az esetre).

## 3. szelet — Anthropic stream (`messages.stream().finalMessage()`), ugyanazzal az őrrel.

Kapuk szeletenként: célzott teszt → teljes unit, tsc, lint; PR szeletenként.
