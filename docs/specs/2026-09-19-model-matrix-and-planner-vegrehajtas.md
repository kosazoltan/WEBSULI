# Végrehajtás — modellmátrix + Opus 5 tervkészítő + célzott javítás

Munkakönyvtár `D:\repo\WEBSULI\source`. Sorrend kötelező; minden szelet után kapuk.

## A. Provider-réteg
1. `server/ai/AIProvider.ts`: `reasoningEffort` marad; `ClaudeProvider` konstruktora vegye át (`config.reasoningEffort`), és a `messages.create` kérés kapja: `thinking: { type: "adaptive" }`, `output_config: { effort }` (csak ha van effort), `max_tokens` a configból.
2. `server/ai/OpenRouterProvider.ts`: a kérés törzsébe `reasoning: { effort: this.reasoningEffort }` ha be van állítva (deepseek/qwen gondolkodó-tokenek korlátozása; glm-nél 0).
3. `server/ai/studio-provider.ts`: `studioConnection` engedje az `anthropic` vendort (kulcs `AI_INTEGRATIONS_ANTHROPIC_API_KEY`), `createStudioProvider` anthropic esetén `ClaudeProvider`. `createStudioStepProvider(model, step)`: lépésenkénti effort/timeout/maxTokens tábla (`STUDIO_STEP_POLICY`): pedagogue medium/16000/300 s; bank és animator low/16000/240 s; gateHelper/quizPolish low; lektor változatlan (480 s, 12000, maxRetries 0, xAI responses low).
4. Teszt `tests/studio-provider-policy.test.ts`: a Claude-kérés alakja (adaptive thinking + effort medium, model `claude-opus-5`) SDK-stubbal; OpenRouter törzs `reasoning.effort=low` glm-nél.

## B. Modellmátrix
5. `server/ai/models.ts`: `STUDIO_STEPS` += `"bank"`; `DEFAULT_MODELS`: pedagogue `claude-opus-5`, animator `z-ai/glm-5.3-flash`, bank `z-ai/glm-5.3-flash`, gateHelper és quizPolish `deepseek/deepseek-v4-flash`; `FALLBACK_MODELS`: pedagogue `grok-4.6`, animator és bank `deepseek/deepseek-v4-flash`, gateHelper/quizPolish `z-ai/glm-5.3-flash`. `providerForModel("claude-opus-5") = anthropic`. `assertDistinctFamilies` változatlan (author×lektor).
6. `server/studio/step-runner.ts` animátor ág: a bank hívás `resolveStudioModel("bank")`, `createStudioStepProvider(model, "bank")`; csomagonként a 3. bukott kísérlet után `gpt-5.6-terra` (a `buildLessonExperience` `call` callbackje kapja a kísérlet sorszámát → `experience-builder.ts` `call(system, user, attempt)`).
7. Tesztek: `tests/models-routing.test.ts` és `tests/direct-studio-api.test.ts` pinek a mátrixra (spec-változás), `tests/lesson-experience.test.ts`: a `call` harmadik paramétere az attempt.

## C. Tervkészítő prompt
8. `server/studio/step-io.ts` `buildPedagoguePrompt`: TILALMAK blokk (csak létező conceptId, ≤ 12 fejezet, egyedi címek, misconceptions létező id-vel, nincs forrásadat-kitalálás, nincs próza), tömör JSON-kimenet; a cél-minta marad. Teszt `tests/studio-pedagogue-prompt.test.ts`: a prompt tartalmazza a tilalmakat és a JSON-alakot; `outlineSchema` elutasítja a 13 fejezetet és az ismétlődő címet (új refine).

## D. Célzott szerzői javítás
9. `server/studio/step-io.ts` `buildAuthorPrompt` round ≥ 1 és fejezetlista esetén: „csak ezeket a fejezeteket add vissza `{ "sections": { "<index>": {...} } }` alakban”; `server/studio/step-runner.ts` author ág: a lektor/kapu jegyzetek `sections.N` útvonalaiból fejezetlista; a válasz egyesítése az előző leckével (`mergeSectionPatches`, `server/studio/section-patch.ts`), majd a meglévő séma/fogalom/kapu ellenőrzés. Fejezet nélküli jegyzetnél teljes újraírás.
10. Teszt `tests/section-patch.test.ts` + runner-teszt: 1 fejezet javítása után a többi fejezet bájtra azonos, és a következő animátor lépés csak a változott fejezet csomagját kéri a modelltől (a többi `experienceCheckpoint.parts` találat).

## F. Szerep-skillek (spec §10)
14. `server/studio/role-skills.ts`: `ROLE_SKILLS` (7 szerep), `withRoleSkill`, `roleSkillVersion`, `skilledPromptLookup`, `roleForPromptName`.
15. Bekötés: `step-runner.ts` `resolveDeps.promptLookup` burkolása; `experience-builder.ts` bank system + `teaching.roleSkill`; `run-extraction.ts` `basePrompt`; `ocr.ts` `OCR_SYSTEM_PROMPT`.
16. Teszt `tests/studio-role-skills.test.ts` (szakaszok, idempotencia, DB-felülírás, OCR, bank); runner (a) hash-teszt a skillel burkolt promptra (spec-változás).

## G. Eszközök és lélek (spec §11)
17. `server/studio/tools/outline-autofix.ts`, `tools/bank-packet-autofix.ts`, `section-visuals.ts` (`deterministicSectionVisuals`, `SECTION_VISUALS_TOOL`, fogalom-nevű képaláírás).
18. Bekötés: `step-runner.ts` pedagógus ág (autofix a séma előtt), animátor ág (`toolVisuals` → nincs modellhívás), `experience-builder.ts` (`autofixBankPacket` + `onToolFix`).
19. `role-skills.ts`: `TOOL_SKILLS`, `ROLE_TOOLS` (Eszközök szakasz a szerep-skillekben), `ROLE_SOULS.pedagogue`; `scripts/studio-tool.ts` + `npm run studio:tool`; `.agents/skills/websuli-studio-tools/SKILL.md`.
20. Tesztek: `tests/studio-tools.test.ts`, `studio-role-skills` (lélek), runner (n2), `section-visuals` (fogalom-nevű caption).

## E. Mérés és kiadás
11. Kapuk: `npx tsc --noEmit`, `npm run check:test`, `npm run lint`, `npm test`.
12. Valódi futás a `a5747585` (Műveleti sorrend) térképen a curate-harness-szel; workflow-naplóból lépésenkénti token és idő; elvárt: bank < 0,2 USD, lecke < 1,2 USD, < 20 perc, `done`.
13. PR → CI → merge → Render revision ellenőrzés; ledger + memória.
