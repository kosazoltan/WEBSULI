import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROLE_SKILLS, ROLE_SKILL_ROLES, ROLE_SKILL_REQUIRED_HEADINGS } from "../server/studio/role-skills";
import { SUPPORT_SKILLS, withSupportSkill, supportSkillVersion, type SupportSkillKey } from "../server/studio/support-skills";
import { REPAIR_SKILL } from "../server/studio/repair-skill";
import { buildCorrectionPrompt } from "../server/studio/source-corrections";
import { scopeRequestParams } from "../server/studio/one-step";

/** Spec 2026-09-23 (docs/specs/2026-09-23-role-skills-everywhere.md): every role has a runbook skill. */

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const MODEL_CALL = /callStepModel\(|chat\.completions\.create\(|messages\.create\(|\.streamChat\(|provider\.chat\(/;
const SKILL_HELPER = /withRoleSkill\(|roleSkillBlock\(|withSupportSkill\(|withRepairSkill\(|skilledPromptLookup\(/;
/** Files whose call receives a system prompt that another module already skilled (checked below). */
const DELEGATED: Record<string, { file: string; helper: RegExp }> = {
  "server/studio/lesson-pipeline-routes.ts": { file: "server/studio/source-corrections.ts", helper: /withSupportSkill\("corrector"/ },
  // Spec 2026-09-25: the shared bank call receives the packet system prompt built by the experience builder.
  "server/studio/bank-call.ts": { file: "server/studio/experience-builder.ts", helper: /roleSkillBlock\("bank"\)/ },
};
/** Provider plumbing, not a role: the prompt arrives already built by the caller. */
const PLUMBING = new Set(["server/studio/run-step.ts"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "ai" || name === "node_modules" ? [] : walk(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

test("minden modellt hívó szerverfájl skill-segédet használ (skill nélküli hívás nem kerülhet be)", () => {
  const offenders: string[] = [];
  for (const path of walk(join(ROOT, "server"))) {
    const rel = relative(ROOT, path).replaceAll("\\", "/");
    const text = readFileSync(path, "utf8");
    if (PLUMBING.has(rel) || !MODEL_CALL.test(text)) continue;
    const delegated = DELEGATED[rel];
    const ok = SKILL_HELPER.test(text) || (delegated && delegated.helper.test(readFileSync(join(ROOT, delegated.file), "utf8")));
    if (!ok) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `skill nélküli modellhívás: ${offenders.join(", ")}`);
});

test("minden skill a kötelező szakaszokkal, tömören", () => {
  const all: Array<[string, string, number]> = [
    ...ROLE_SKILL_ROLES.map((r) => [r, ROLE_SKILLS[r], r === "lektor" ? 4800 : 6000] as [string, string, number]),
    ["repair", REPAIR_SKILL, 4000],
    ...(Object.keys(SUPPORT_SKILLS) as SupportSkillKey[]).map((k) => [k, SUPPORT_SKILLS[k], 2800] as [string, string, number]),
  ];
  for (const [name, text, max] of all) {
    for (const heading of ROLE_SKILL_REQUIRED_HEADINGS) assert.ok(text.includes(heading), `${name}: ${heading}`);
    assert.ok(text.length <= max, `${name} túl hosszú: ${text.length} > ${max}`);
  }
  for (const key of ["scope", "corrector", "web-research", "web-author", "web-lektor", "web-repair", "html-improve", "html-fix", "creator-analyze", "creator-chat", "quiz-generator"]) {
    assert.ok(key in SUPPORT_SKILLS, key);
  }
});

test("a lektor támpontjai: mérce-sorrend, bejárás, cáfolás, egy gyökérok = egy jegyzet, jegyzet-alak", () => {
  const lektor = ROLE_SKILLS.lektor;
  for (const must of ["## Mérce", "FORRÁS-HELYESBÍTÉSEK", "saját tudás: SOHA nem blokkoló", "Bejárás", "Cáfolás a jelentés előtt", "Egy gyökérok = egy jegyzet", "Mi hamis:", "Átírási hiba"]) {
    assert.ok(lektor.includes(must), must);
  }
  assert.match(SUPPORT_SKILLS["web-lektor"], /forrásban nem szereplő tartalmat követelt/);
});

test("a támogató skill a rendszerutasítás elejére kerül, idempotens, és be van kötve", () => {
  const once = withSupportSkill("scope", "X");
  assert.ok(once.startsWith(`=== TÁMOGATÓ SKILL: scope (v${supportSkillVersion("scope")})`));
  assert.equal(withSupportSkill("scope", once), once);
  assert.ok(String(scopeRequestParams("m", []).messages[0].content).startsWith("=== TÁMOGATÓ SKILL: scope "));
  assert.ok(buildCorrectionPrompt([], undefined, true).startsWith("=== TÁMOGATÓ SKILL: corrector "));
});
