import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_SKILLS, ROLE_SKILL_ROLES, ROLE_SKILL_REQUIRED_HEADINGS, roleSkillBlock, roleSkillVersion,
  withRoleSkill, roleForPromptName, skilledPromptLookup,
} from "../server/studio/role-skills";
import { OCR_SYSTEM_PROMPT, ocrCacheKeyOf } from "../server/studio/ocr";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Tulajdonosi döntés 2026-09-19: minden modell a saját szakaszának skilljét kapja — nincs rögtönzés. */

test("minden szerepnek van skillje a kötelező szakaszokkal, tömören", () => {
  assert.deepEqual([...ROLE_SKILL_ROLES], ["extract", "ocr", "pedagogue", "author", "animator", "bank", "lektor"]);
  for (const role of ROLE_SKILL_ROLES) {
    const text = ROLE_SKILLS[role];
    assert.match(text, new RegExp(`^# Skill: .*\\(${role}\\)`), role);
    for (const heading of ROLE_SKILL_REQUIRED_HEADINGS) assert.ok(text.includes(heading), `${role}: hiányzik ${heading}`);
    assert.ok(text.length < 3200, `${role}: a skill legyen tokentakarékos (${text.length} karakter)`);
    assert.match(text, /Kizárólag JSON|Csak sima szöveg/, `${role}: a kimenet alakja kimondva`);
  }
});

test("a skill-blokk verziózott, a rendszerutasítás elejére kerül és idempotens", () => {
  const system = "Te vagy a pedagógus.";
  const once = withRoleSkill("pedagogue", system);
  assert.ok(once.startsWith(`=== SZAKASZ-SKILL: pedagogue (v${roleSkillVersion("pedagogue")})`));
  assert.ok(once.endsWith(system));
  assert.ok(once.includes("=== SKILL VÉGE ==="));
  assert.equal(withRoleSkill("pedagogue", once), once, "kétszer nem duplázódik");
  assert.equal(roleSkillBlock("bank").includes(ROLE_SKILLS.bank), true);
  assert.notEqual(roleSkillVersion("author"), roleSkillVersion("lektor"));
  assert.match(roleSkillVersion("author"), /^[a-f0-9]{12}$/);
});

test("a DB-s prompt-felülírás sem kerülheti meg a skillt (promptLookup burkolás)", async () => {
  const lookup = skilledPromptLookup(async (name, fallback) => name === "studio.author.v1" ? "ADMIN ÁLTAL FELÜLÍRT PROMPT" : fallback);
  const author = await lookup("studio.author.v1", "beépített");
  assert.ok(author.startsWith("=== SZAKASZ-SKILL: author "));
  assert.ok(author.endsWith("ADMIN ÁLTAL FELÜLÍRT PROMPT"));
  const fix = await lookup("studio.author.fix.v1", "beépített javító");
  assert.ok(fix.startsWith("=== SZAKASZ-SKILL: author "), "a célzott javítás is a szerző skilljét kapja");
  for (const [name, role] of [["studio.pedagogue.v1", "pedagogue"], ["studio.animator.v1", "animator"], ["studio.lektor.v1", "lektor"], ["studio.extractor.system", "extract"]] as const) {
    assert.equal(roleForPromptName(name), role);
  }
  assert.equal(roleForPromptName("valami.mas"), undefined);
  assert.equal(await lookup("valami.mas", "x"), "x");
});

test("az OCR prompt a saját skilljével indul, és a cache-kulcs a promptot tartalmazza", () => {
  assert.ok(OCR_SYSTEM_PROMPT.startsWith("=== SZAKASZ-SKILL: ocr "));
  assert.match(OCR_SYSTEM_PROMPT, /Output plain text only\.$/);
  assert.notEqual(ocrCacheKeyOf("img", "m"), ocrCacheKeyOf("img", "m", "más prompt"));
});

test("a bankcsomag rendszerutasítása a bank skilljével indul", async () => {
  const lesson = standardFusionFixture(), e = lesson.experience!;
  let system = "";
  await buildLessonExperience(lesson, [], { call: async (s) => { system ||= s; return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] }; } });
  assert.ok(system.startsWith("=== SZAKASZ-SKILL: bank "));
  assert.ok(system.includes("## Tilalmak"));
});
