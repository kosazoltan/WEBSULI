# Végrehajtás — skill minden szerepkörnek

1. `source/server/studio/support-skills.ts`: `SUPPORT_SKILLS: Record<SupportSkillKey, string>`, `supportSkillVersion`, `withSupportSkill` (fejléc: `=== TÁMOGATÓ SKILL: <key> (v<hash12>) ===` … `=== SKILL VÉGE ===`). Csak `node:crypto` import (a routes.ts is használja, nincs körkörös import).
2. Skillek: a `scope` és `corrector` szöveget én írom (a promptjuk a kezemben van); a webes, HTML és készítő/kvíz skilleket alügynök-tervezetből, a kódhoz visszaellenőrizve (minden formátum-állítás file:line alapján).
3. Bekötés: `one-step.ts` `scopeRequestParams` system; `source-corrections.ts` `buildCorrectionPrompt`; `step-runner.ts` `fixConceptOnLesson` lektor → `withRoleSkill("lektor", …)`; web-research-runner / web-teaching-review / web-teaching-repair / web-bank-repair; improveAsync; routes.ts html-fix ×3, enhanced-creator ×4, material-creator chat (DB-prompt UTÁN); gameQuizGeneratorService.
4. `role-skills.ts`: lektor-skill csere (scratchpad `lektor-skill.md`), extract + author rövid kiegészítés.
5. Tesztek: `tests/role-skills-everywhere.test.ts` (szerkezet, méret, lektor-támpontok, statikus hívás-őr).
6. Menü: `/skills/tananyag-javito/roles` + a lektor a listán; a támogató skillek külön végponton.
7. Kapu: tsc, eslint (1166), `node --test tests/*.test.ts`, build.
