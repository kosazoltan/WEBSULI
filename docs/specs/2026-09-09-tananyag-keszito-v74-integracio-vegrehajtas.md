# Végrehajtás: v7.4 skill beépítése

> Spec: `docs/specs/2026-09-09-tananyag-keszito-v74-integracio.md`

1. **Create** `source/server/ai/lesson-html-spec.ts` — `LESSON_SPEC_VERSION`, `LESSON_HTML_SPEC_V74`, `LESSON_THEMES`, `pickLessonTheme`, `lessonThemePrompt`, `lessonHtmlSpecPrompt`.
2. **Modify** `source/server/studio/web-research-agent.ts` — `LESSON_HTML_REQUIREMENTS = LESSON_HTML_SPEC_V74` (alias), a system prompt a `lessonHtmlSpecPrompt`-ot fűzi be témával; `webResearchSystemPrompt(classroom, title, topicSeed?)`.
3. **Modify** `source/server/studio/web-research-routes.ts` — `verifyImprovedHtml` a kész HTML-re, `html_generated.warnings`; a system blokkon `cache_control`.
4. **Modify** `source/client/src/components/studio/WebResearchAgentPanel.tsx` — `warnings` megjelenítése.
5. **Modify** `source/server/routes.ts` — 1676: a beépített v7.1-blokk helyett preambulum + `lessonHtmlSpecPrompt`; a DB-s prompt mellé is hozzáfűzve. 2349: ugyanígy (a `textContent`/`metadata` rész marad).
6. **Modify** `source/server/improveAsync.ts` — a v7.1 CSS/feladat-szabályok helyett a spec-et fűzi be (a „TARTALOM MEGŐRZÉSE” + formátum-szabályok maradnak).
7. **Test** `source/tests/lesson-html-spec.test.ts`.
8. **Verify**: tsc, eslint, `node --import tsx --test tests/*.test.ts`, valós generálás + headless Chrome önteszt.
