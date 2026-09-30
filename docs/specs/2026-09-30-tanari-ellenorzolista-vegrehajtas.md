# Végrehajtás: Tanári kérés ellenőrzőlista-kapu

Spec: `docs/specs/2026-09-30-tanari-ellenorzolista.md`. Munkakönyvtár: `source/`. Ág: `feat/tanari-ellenorzolista`.

1. `server/studio/support-skills.ts`: `instruction-checker` skill (kötelező fejlécek, ≤ 2800 karakter).
2. `server/ai/studio-provider.ts`: `STUDIO_STEP_POLICY.instructionCheck = { timeoutMs: 180_000, maxTokens: 12_000, reasoningEffort: "medium" }`.
3. `server/studio/instruction-check.ts`:
   - `INSTRUCTION_CHECK_MODEL = "claude-opus-5-5"`;
   - `teachingText(lesson)` → fejezetenként `[N] cím\n szöveg` (explain.text, example.problem/steps/answer, recap.bullets);
   - `instructionCheckHash(instruction, lesson)` (sha256);
   - `buildInstructionCheckPrompt(instruction, lesson)` → `{ system: withSupportSkill("instruction-checker", …), user }`;
   - `parseInstructionCheck(json, lesson)` → `{ points: InstructionPoint[] }`, a hallucináció-őrrel (normalizált részszöveg-egyezés);
   - `missingPoints(points)`.
4. `server/studio/section-patch.ts`: `GateFeedbackLike.instruction?: Array<{ sectionIdx: number | null; point: string }>`;
   `targetedRepairSections`: a fejezethez kötött pont a célokhoz ad, a fejezet nélküli → null; a `explained` számba beleszámít.
5. `server/studio/autonomous.ts`: `instruction_missing` ok + szöveg.
6. `server/studio/step-runner.ts` `runGate`: a lektor-bizonyíték (7.4) ELŐTT, ha van `ownerInstruction` és a lecke fúziós:
   gyorsítótár vagy hívás → hiányzó pontok → javítókör vagy figyelmeztetés (spec §4). Hibánál `logger.warn`, folytatás.
7. Tesztek + parancsok: `npx tsx --test tests/instruction-check.test.ts`, runner-tesztek, teljes suite, `tsc` (main + test), eslint.
