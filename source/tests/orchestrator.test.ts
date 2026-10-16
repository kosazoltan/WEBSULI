import test from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../server/workflows/redact";
import { PROMPT_ROLES } from "../shared/instruction-bundles/roles";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import { StepModelError } from "../server/studio/run-step";

/* Spec 2026-10-05-s9-prompt-javito-orkesztrator — tulajdonosi tervezés: hibaelemzés + javító prompt a bukott szerepnek. */

test("titok soha nem kerül az orkesztrátor promptjába", () => {
  // Álkulcsok futásidőben összerakva (a forrásban ne legyen kulcs-alakú literál — gitleaks).
  const fakeRouter = ["sk", "or", "v1", "q".repeat(26)].join("-"), fakeXai = ["xai", "Q".repeat(20)].join("-"), fakeTest = ["sk", "test", "9".repeat(20)].join("-");
  const leaked = redactSecrets(`kulcs: ${fakeRouter} és Bearer: abc.def.ghi és ${fakeXai}`);
  assert.doesNotMatch(leaked, /q{26}|abc\.def\.ghi|Q{20}/);
  // S4b (docs/specs/2026-10-16-egy-futas.md): buildOrchestratorPrompt (workflows/orchestrator.ts) removed with the old multi-agent pipeline; its prompt-redaction assertion went with it.
});

test("a bukott nyers kimenet a hibán utazik (orkesztrátornak), az üzenetben nem", () => {
  const e = new StepModelError("lektor", "a válasz nem érvényes JSON (…)", { rawOutput: '{"notes": [ SECRET-LOOKING' });
  assert.equal(e.rawOutput, '{"notes": [ SECRET-LOOKING');
  assert.doesNotMatch(e.message, /SECRET-LOOKING/);
  // S4b (docs/specs/2026-10-16-egy-futas.md): clipMiddle (workflows/orchestrator.ts) removed with the orchestrator; its assertion went with it.
});

test("a szerep és a skill regisztrálva, a kötelező szakaszokkal", () => {
  assert.ok((PROMPT_ROLES as readonly string[]).includes("orchestrator"));
  for (const h of ["## Szerep", "## Bemenet", "## Kimenet", "## Lépések", "## Tilalmak", "## Önellenőrzés a válasz előtt"]) assert.ok(SUPPORT_SKILLS.orchestrator.includes(h), h);
});
