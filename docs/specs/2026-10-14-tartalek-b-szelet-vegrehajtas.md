# Végrehajtás: tartalék — B1 alszelet (2026-10-14)

Spec: `docs/specs/2026-10-14-tartalek-b-szelet.md`. Parancsok a `source/` mappából. Sorrend: teszt → kód → zöld.

## V1 — szabály és segéd
- `server/ai/models.ts`: `independentFallbackFor(model, checkedModels?)`.
- `server/ai/studio-provider.ts`: `crossFamilyFallbackOptions` — tartalékhívásnál a `MODEL_REASONING_EFFORT` modellje (Qwen
  high) is felülírja a lépés-szabályzat effortját.
- `server/studio/run-step.ts`: `callStepModelWithFallback(input, { providerFactory, providerStep?, keyConfigured?,
  checkedModels?, signal? })` → `{ json, usage, model }` (a TÉNYLEGES modell).

## V2 — hívóhelyek
- `step-runner.ts`: vak megoldó és bank-ellenőr (`checkedModels: [bank-elsődleges]`); pontjegyzék; kérés-ellenőrzés
  (`checkedModels: authorModels`); szövegjavító (szerzőlépésben a tényleges modell → `authorModels`); fogalomjavítás (szerző
  tartalékkal, lektor `lektorChainFor([tényleges szerző])` láncon).
- `web-teaching-repair.ts`: `callTeachingRepair` tartalékkal; a tényleges modell a `repairWrote`-ba.
- `web-bank-repair.ts`: `repairCall` tartalékkal.
- `structured-improvement.ts`: a `call` tartalékkal; a szerző tényleges modellje gyűlik, a lektor a láncon.

## V3 — tesztek
- Új: `tests/cross-family-fallback-b.test.ts` — `independentFallbackFor` (ellenőrző/nem ellenőrző, Qwen-ütközés), a segéd
  (elsődleges → tartalék, `{ fallback: true }`, a tényleges modell visszaadva, megszakításnál nincs tartalék, kulcs nélkül
  nincs tartalék), Qwen-tartalék high effort a kérésben.

- Dokumentált spec-változás: `lesson-pipeline-runner.test.ts` „review #177 (2.2b)” — a vak megoldó egyetlen újrakérése most az
  elsődlegesen és a független tartalékon (Qwen) fut: 3 hívás (1 részleges + 2 bukó), és utána sincs újabb fizetett próba.

## V4 — kapuk
- `npm.cmd run check`, `check:test`, `lint`, `test`, `build`.

## B2 — tantárgy-felismerés és kivonatoló (külön PR)
- `server/studio/claude-vision.ts`: `openAiPartsToClaude` (szöveg / `image_url` / `file` data URL → Claude-blokk a meglévő
  `claudeSourceBlock`-kal; nem data URL → hiba) és `callClaudeParts` (adaptív gondolkodás, `output_config.effort`, csonka → hiba).
- `one-step.ts` `callScopeModel`: elsődleges út változatlan; hibánál `crossFamilyFallback` — Anthropic tartalék a Claude-úton
  (16k keret), OpenAI tartalék a meglévő úton medium efforttal.
- `run-extraction.ts` `callExtractorModel`: ugyanígy; Claude-tartalék JSON-mód nélkül (`stripJsonFences` + `JSON.parse`), az
  OpenAI-tartalék `reasoning_effort: "medium"`-mal.
- `web-research-runner.ts` webes kivonatoló: szöveges hívás, hibánál a tartalék `crossFamilyFallbackOptions`-szal.
- Teszt: `tests/cross-family-fallback-b2.test.ts` — átalakítás (szöveg/kép/PDF, nem data URL → hiba); scope: luna 500 → Opus a
  képpel, medium.

## B3b — adminisztrációs útvonalak (külön PR, a B2-re épül)
- `server/ai/legacy-fallback.ts`: `legacyFallbackFor`, `isCompleteFinish`, `crossFamilyComplete` (a teljes választ egyben, tétlenségi
  őrös streammel kéri; medium effort; OpenAI-tartaléknál JSON-mód).
- `routes.ts`: htmlFix, htmlTheme (Claude → Sol, a `withAIProvider` újrapróbái után); htmlFixStream (magyarázó fázis csak az első
  darab előtt, JSON-fázis); claudeChat, claudeHtml (közös `onText`; a tartalék egyben; a HTML-teljesség a lezárás okából; a
  Claude-tétlenségi őr a tartalék előtt leáll); chatgptChat (Opus, csak az első darab előtt); analyzeFiles ×2 (Opus a
  `claude-vision` képolvasóval, a séma kulcsai a promptban).
- Teszt: `tests/cross-family-fallback-b3b.test.ts` (segéd: effort, JSON-mód, szerepek, megszakítás/kulcs nélkül nincs tartalék;
  forrás-szint: mind a 9 hívás, „csak az első darab előtt” őrök, teljesség-ellenőrzés).
