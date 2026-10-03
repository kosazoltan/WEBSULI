# Végrehajtás — GPT-6.1 Sol + KV-cache

1. `server/ai/models.ts`: `htmlFixStream`/`analyzeFiles`/`chatgptChat` → `gpt-6.1-sol`; `MAX_OUTPUT_BY_MODEL["gpt-6-1-sol"]`.
   `tests/ai-model-routing-complete.test.ts` elvárásai a tulajdonosi döntés szerint.
2. `server/ai/prompt-cache.ts` (új): `cachedSystem(staticPart, dynamicPart?)` → `[{text, cache_control}, {text}]`;
   `claudeSystemFromMessages(contents[])` → egy elem: string (változatlan), több: blokkok, töréspont az utolsó előtti végén;
   `cacheConversation(messages)` → ha a beszélgetésben van assistant-üzenet, az első user-üzenet szöveges blokk `cache_control`-lal.
3. `server/ai/lesson-html-spec.ts`: `lessonHtmlSpecParts(opts)` → `{ theme, spec }`; `lessonHtmlSpecPrompt` ebből.
4. `server/ai/ClaudeProvider.ts` `streamChat`: `claudeSystemFromMessages` + `cacheConversation`.
5. `server/improveAsync.ts`: a statikus prompt a `spec`-et tartalmazza; a téma második system-üzenet; a folytatás
   (`server/improve/continuation.ts`) `string | string[]` system-et fogad.
6. `server/routes.ts`: htmlFix/htmlTheme (egyedi utasítás a végére), claudeChat és claude-html (téma, tartalom, metadata a
   töréspont után; kérés-szintű `cache_control` a beszélgetésre), chatgptChat (évfolyam a prompt végére).
7. `server/studio/web-research-agent.ts`: a gyűjtő prompt statikus sorai elöl, a cím/évfolyam/mag a végén
   (`webResearchGatherParts`); `web-research-runner.ts`: két blokk + kérés-szintű `cache_control`.
8. `server/gameQuizGeneratorService.ts`: `cachedSystem`.
9. Teszt: `tests/prompt-cache.test.ts` (segédfüggvények, spec-egyenértékűség, forrás-ellenőrzés a híváshelyekre).
   tsc main+test, lint, teljes unit, visszajátszás.
