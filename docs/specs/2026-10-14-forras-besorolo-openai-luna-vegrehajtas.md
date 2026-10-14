# Végrehajtás: forrás-besoroló gpt-6-luna, közvetlen OpenAI (2026-10-14)

Spec: `docs/specs/2026-10-14-forras-besorolo-openai-luna.md`. **Utólag pótolva** a PR #209 review-ja alapján (Codex P1,
Copilot: a háromfázisú munkarend — `docs/agent-haromfazisu-munka.md:9,31` — a spec mellé végrehajtási utasítást ír elő).
A feladatok a ténylegesen végrehajtott sorrendet rögzítik. Minden parancs a `source/` mappából fut.

## T1 — RED tesztek
- Fájl: `source/tests/scope-luna-openai.test.ts`
- Lépés: tesztek a `scope` lépésre (alapmodell `gpt-6-luna`, `STUDIO_MODEL_SCOPE` felülírás), a scope-kérésre (közvetlen
  OpenAI, `reasoning_effort: "high"`, `max_completion_tokens ≥ 8000`, nincs `reasoning` mező, OpenRouter-kulcs nélkül), a két
  hívóhelyre (kommentmentes forráson, valódi hívás) és a besoroló-listára (Luna első, mind OpenAI, különböző, ≥ 3).
- Parancs: `node --import tsx --test tests/scope-luna-openai.test.ts`
- Elvárt kimenet (implementáció előtt): `ℹ fail 4`.

## T2 — `scope` lépés a modell-regiszterben
- Fájl: `source/server/ai/models.ts`
- Lépés: `STUDIO_STEPS` + `"scope"`; `DEFAULT_MODELS.scope = "gpt-6-luna"` (mérési indoklással); `SCOPE_EFFORT = "high"`.
- Az `ocr` lépés modellje NEM változik (kézírásos mérés nélkül tilos — spec, Nyitott kérdés).

## T3 — scope-hívás
- Fájl: `source/server/studio/one-step.ts`
- Lépés: `scopeRequestParams(model, parts, effort = "low")` — `low` → 2000 keret (a GLM-mérés tesztje változatlan),
  egyébként 8000 (mért max 2448); `callScopeModel(files, model, effort = SCOPE_EFFORT)`; a gyártóspecifikus mezőt az
  `ocrVendorRequest` képzi (OpenAI: `reasoning_effort`, OpenRouter: `reasoning`).

## T4 — hívóhelyek
- Fájlok: `source/server/studio/lesson-pipeline-routes.ts` (egylépéses gyártás), `source/server/studio/routes.ts`
  (`/maps/extract`) — `resolveStudioModel("ocr")` → `resolveStudioModel("scope")` a `callScopeModel` hívásban.

## T5 — katalógus-besoroló
- Fájlok: `source/server/catalog/classify.ts` (`CLASSIFIER_MODELS = ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-sol"]`),
  `source/server/ai/studio-provider.ts` (`catalogClassify` szabályzat: high effort, 120 s, 8k, JSON-mód — review #209),
  `source/scripts/catalog/classify.mts` (a `catalogClassify` szabályzatot használja, nem a `topicFocus`-t).

## T6 — dokumentált tesztmódosítások
- `tests/catalog-classify.test.ts`: az új modell-lista és a teszt neve.
- `tests/direct-studio-api.test.ts`: `map.scope === "gpt-6-luna"` (az `ocr` állítás marad).
- `tests/models-routing.test.ts`: szolgáltató-mátrix + `scope: "openai"`.

## T7 — verifikáció
- `node --import tsx --test tests/scope-luna-openai.test.ts tests/catalog-classify.test.ts` → `ℹ fail 0`.
- Reverz-mutáció: `routes.ts` hívóhely vissza `"ocr"`-ra és `SCOPE_EFFORT = "low"` → a T1 tesztekből 2 bukik; visszaállítva zöld.
- Élő próba (OpenRouter-kulcs nélkül, valódi `callScopeModel` + `inferScope`): „Oszthatóság 3-mal és 9-cel” → Matematika / 6;
  „A víz körforgása” → Környezetismeret / 4; kinyert szöveg nélküli PDF → Matematika / 6 (a review „PDF bukik” állítása cáfolva).
- Kapuk: `npm.cmd run check`, `check:test`, `lint`, `test`, `build` → mind exit 0.

## Review #209 — nem ebben a PR-ben javított, külön feladat
- „Más felhasználó térképe újrahasznosul” (`routes.ts:227`, `inputHash`-alapú keresés): a PR ezt a sort csak a modellnévben
  érinti; a viselkedés korábbi. Külön jegy.
- „Keretkimerülésnél OpenRouterre esik” (`withQuotaFailover`): a tulajdonos a szűk hatókört választotta; külön döntés.
