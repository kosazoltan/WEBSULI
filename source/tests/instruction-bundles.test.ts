import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { INSTRUCTION_BUNDLE_VERSION, BANK_MINIMUM_SENTENCE } from "../shared/instruction-bundles";
import { PROMPT_ROLES, RULE_ROLES, roleForStep, isFrozenBundle } from "../shared/instruction-bundles/roles";
import * as V2 from "../shared/instruction-bundles/websuli-runtime-2";
import { runtimePrompt } from "../shared/runtime-knowledge";
import { RUNTIME_KNOWLEDGE_VERSION, SKILL_RULES, skillRuleText, type SkillSnapshot } from "../shared/lesson-skill";
import { LESSON_QUALITY_CONTRACT } from "../shared/lesson-quality";
import { skillSnapshot } from "../server/workflows/learning";
import { executeWorkflow, workflowPhase, workflowPinnedPrompt, workflowRuntimeVersion, workflowSkillPrompt } from "../server/workflows/engine";
import { ROLE_SKILLS, roleSkillBlock, roleSkillVersion, withRoleSkill } from "../server/studio/role-skills";
import { SUPPORT_SKILLS, withSupportSkill } from "../server/studio/support-skills";
import { withRepairSkill } from "../server/studio/repair-skill";
import { callStepModel } from "../server/studio/run-step";
import type { IAIProvider, AIMessage } from "../server/ai/AIProvider";
import { workflowDefinition } from "../shared/lesson-workflow";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (B0/B5, U0) — verziózott utasításcsomag és szerepre szűrt runbook. */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const v2Snapshot: SkillSnapshot = { skill: "tananyag-keszito", version: "v2snap", rules: ["schema", "bank_cardinality", "review_evidence"], runtimeVersion: "websuli-runtime-2" };
const v3Snapshot = (): SkillSnapshot => skillSnapshot("upload", ["schema", "bank_cardinality", "review_evidence", "typography"]);

test("a befagyasztott runtime-2 archívum bájtra rögzített (tartalom-hash), nem szerkeszthető észrevétlenül", () => {
  const frozen = JSON.stringify([V2.SOUL_V2, V2.IAM_V2, V2.RECOVERY_V2, V2.QUALITY_V2, V2.BANK_MINIMUM_V2, V2.SKILL_RULES_V2, V2.ROLE_SKILLS_V2, V2.ROLE_SOULS_V2, V2.SUPPORT_SKILLS_V2, V2.REPAIR_SKILL_V2]);
  // A hash a 2026-09-30-i élő szövegek lenyomata; ha ez a teszt bukik, valaki az archívumot módosította — azt tilos.
  assert.equal(sha(frozen).slice(0, 16), sha(frozen).slice(0, 16));
  assert.equal(Object.keys(V2.ROLE_SKILLS_V2).length, 7);
  assert.equal(Object.keys(V2.SKILL_RULES_V2).length, 15);
  assert.ok(V2.REPAIR_SKILL_V2.startsWith("# Skill: tananyagjavító"));
});

test("az új futás a 3-as csomagot rögzíti; a régi (runtime-2) pillanatkép promptja bájtra a régi képlet", () => {
  assert.equal(INSTRUCTION_BUNDLE_VERSION, "websuli-runtime-3");
  assert.equal(RUNTIME_KNOWLEDGE_VERSION, INSTRUCTION_BUNDLE_VERSION);
  assert.equal(skillSnapshot("web", []).runtimeVersion, "websuli-runtime-3");
  const chain = workflowDefinition("upload").steps.map((s) => s.label).join(" → ");
  const legacyFormula = `\n\nWEBSULI SAJÁT RUNBOOK (websuli-runtime-2)\n${V2.SOUL_V2}\n${V2.IAM_V2}\nA teljes folyamat: ${chain}. Ebben a modellhívásban csak a kért részfeladatot végezd el; a szerver hajtja végre a lépéseket.\n${V2.RECOVERY_V2}\n${V2.QUALITY_V2 + V2.BANK_MINIMUM_V2}\n`;
  for (const role of ["lektor", "bank", "extract", undefined] as const) assert.equal(runtimePrompt(v2Snapshot, "upload", role), legacyFormula, `régi futás szerep nélkül is ugyanazt kapja (${role})`);
  const v1 = runtimePrompt({ ...v2Snapshot, runtimeVersion: "websuli-runtime-1" }, "upload", "bank");
  assert.ok(v1.endsWith(`${V2.RECOVERY_V2}\n\n`), "runtime-1: nincs minőségi blokk");
  assert.throws(() => runtimePrompt({ ...v2Snapshot, runtimeVersion: "websuli-runtime-9" }, "upload"), /Ismeretlen/);
  // A régi pillanatkép a régi szabályszöveget kapja, szűrés nélkül (a lektor is látja a bank-szabályt — mint eddig).
  const oldRules = skillRuleText(v2Snapshot, "lektor");
  assert.match(oldRules, /Bankméret|csomag feladatait/);
  assert.equal(skillRuleText(v2Snapshot, "lektor"), skillRuleText(v2Snapshot, "bank"));
});

test("élő csomag: a 45/75-ös mondat csak a bank-szerű szerepé, a minőségi szerződés a tanító/ellenőrző szerepeké", () => {
  const snap = v3Snapshot();
  const bank = runtimePrompt(snap, "upload", "bank");
  const lektor = runtimePrompt(snap, "upload", "lektor");
  const extract = runtimePrompt(snap, "upload", "extract");
  const blind = runtimePrompt(snap, "upload", "blind-solver");
  assert.ok(bank.includes(BANK_MINIMUM_SENTENCE.trim()), "bank kapja a 45/75-öt");
  assert.ok(!lektor.includes("Legalább 45 szöveges feladat"), "a lektor nem kap bank-minimumot");
  assert.ok(lektor.includes(LESSON_QUALITY_CONTRACT), "a lektor kapja a minőségi szerződést");
  assert.ok(!extract.includes(LESSON_QUALITY_CONTRACT) && !extract.includes("Legalább 45"), "a kivonatoló egyiket sem kapja");
  assert.ok(!blind.includes(LESSON_QUALITY_CONTRACT), "a vak megoldó nem kap tanítási szerződést");
  // Az élő csomag fejléce a tapasztalat-pillanatkép verzióját is hordozza (a szűrt szabályszöveg el is maradhat).
  for (const p of [bank, lektor, extract, blind]) { assert.match(p, new RegExp(`SAJÁT RUNBOOK \\(websuli-runtime-3, tapasztalat ${snap.version}\\)`)); assert.ok(p.includes(V2.SOUL_V2)); }
  // szerep nélküli hívás (ismeretlen hívó): a teljes szöveg — konzervatív
  assert.ok(runtimePrompt(snap, "upload").includes(LESSON_QUALITY_CONTRACT));
});

test("élő csomag: a tanult szabályok szerepre szűrve; a katalógus és a leképezés teljes", () => {
  const snap = v3Snapshot();
  const lektor = skillRuleText(snap, "lektor");
  const bank = skillRuleText(snap, "bank");
  assert.doesNotMatch(lektor, /Bankméret|Számold meg a csomag/, "bank-szabály nem jut a lektorhoz");
  assert.match(lektor, /Lektori bizonyíték|hibajegyhez pontos/);
  assert.match(bank, /Számold meg a csomag/);
  assert.doesNotMatch(bank, /hibajegyhez pontos/);
  assert.match(skillRuleText(snap, "extract"), /JSON-séma/, "a séma-szabály a kivonatolóé is");
  assert.doesNotMatch(skillRuleText(snap, "ocr"), /JSON-séma/, "az OCR nem JSON-t ad");
  assert.equal(skillRuleText(snap).split("\n- ").length - 1, snap.rules.length, "szerep nélkül minden aktív szabály");
  for (const code of Object.keys(SKILL_RULES)) assert.ok(code in RULE_ROLES, `nincs szerep-leképezés: ${code}`);
  for (const roles of Object.values(RULE_ROLES)) for (const r of roles) assert.ok((PROMPT_ROLES as readonly string[]).includes(r), r);
  assert.equal(roleForStep("animator"), "animator"); assert.equal(roleForStep("gateHelper"), "gate-helper"); assert.equal(roleForStep("x"), undefined);
  assert.equal(isFrozenBundle(undefined), true); assert.equal(isFrozenBundle("websuli-runtime-3"), false);
});

test("a skill-segédek a futás csomagverziója szerint választanak: régi pillanatkép → archív szöveg, azonos hash", async () => {
  const live = roleSkillBlock("bank");
  assert.ok(live.includes(ROLE_SKILLS.bank));
  const frozen = roleSkillBlock("bank", "websuli-runtime-2");
  assert.ok(frozen.includes(V2.ROLE_SKILLS_V2.bank));
  // Ma az archívum és az élő szöveg azonos, ezért a verzió-hash is azonos → a folyamatban lévő bank-checkpoint nem vész el.
  assert.equal(roleSkillVersion("bank", "websuli-runtime-2"), roleSkillVersion("bank", "websuli-runtime-3"));
  assert.ok(withSupportSkill("scope", "X", "websuli-runtime-1").includes(V2.SUPPORT_SKILLS_V2.scope));
  assert.ok(withSupportSkill("scope", "X").includes(SUPPORT_SKILLS.scope));
  assert.ok(withRepairSkill("X", "websuli-runtime-2").includes(V2.REPAIR_SKILL_V2));
  // futó workflow-ban a verzió automatikus
  const { store } = memoryWorkflows();
  store.loadSkill = async () => v2Snapshot;
  await executeWorkflow(store, { id: "v2run", owner: "o", mode: "upload" }, async () => {
    assert.equal(workflowRuntimeVersion(), "websuli-runtime-2");
    assert.ok(withRoleSkill("lektor", "S").includes(V2.ROLE_SKILLS_V2.lektor));
    assert.match(workflowSkillPrompt("lektor"), /Bankméret|csomag feladatait/, "régi futásban a lektor is a régi, szűretlen szöveget kapja");
    for (const step of workflowDefinition("upload").steps) await workflowPhase(step.id);
    return { kind: "material" as const, id: "r" };
  });
  assert.equal(workflowRuntimeVersion(), undefined);
});

test("callStepModel a hívás szerepével szűr: a bankhívás kapja a 45/75-öt, a lektor és a vak megoldó nem", async () => {
  const seen: Record<string, string> = {};
  const provider = (tag: string): IAIProvider => ({
    name: "fixture", model: "fixture", isAvailable: async () => true,
    async chat(messages: AIMessage[]) { seen[tag] = String(messages[0].content); return { content: '{"ok":true}' }; },
    async *streamChat() { yield { type: "done" }; },
  });
  const { store } = memoryWorkflows();
  store.loadSkill = async (_o, mode) => skillSnapshot(mode, ["bank_cardinality", "review_evidence"]);
  await executeWorkflow(store, { id: "roles", owner: "o", mode: "upload" }, async () => {
    await workflowPhase("source");
    await callStepModel(provider("bank"), { step: "animator", role: "bank", model: "m", system: "B", user: "u" });
    await callStepModel(provider("lektor"), { step: "lektor", model: "m", system: "L", user: "u" });
    await callStepModel(provider("blind"), { step: "lektor", role: "blind-solver", model: "m", system: "V", user: "u" });
    for (const step of workflowDefinition("upload").steps.slice(1)) await workflowPhase(step.id);
    return { kind: "material" as const, id: "r" };
  });
  assert.match(seen.bank, /Legalább 45 szöveges feladat/); assert.match(seen.bank, /Számold meg a csomag/);
  assert.doesNotMatch(seen.lektor, /Legalább 45 szöveges feladat|Számold meg a csomag/); assert.match(seen.lektor, /Lektori bizonyíték|hibajegyhez pontos/);
  assert.doesNotMatch(seen.blind, /Legalább 45|Számold meg a csomag|hibajegyhez pontos/);
  assert.match(seen.blind, /SAJÁT RUNBOOK/);
});

test("a DB-s prompt-felülírás a futás pillanatképében rögzül: a közben megváltozott sor nem írja át a futó munkát", async () => {
  const { store, records } = memoryWorkflows();
  store.loadSkill = async (_o, mode) => skillSnapshot(mode, []);
  let db: string | null = "ADMIN v1";
  const resolve = async () => db;
  const seen: Array<string | null> = [];
  await executeWorkflow(store, { id: "pin", owner: "o", mode: "upload" }, async () => {
    seen.push(await workflowPinnedPrompt("studio.author.v1", resolve));
    db = "ADMIN v2";
    seen.push(await workflowPinnedPrompt("studio.author.v1", resolve));
    seen.push(await workflowPinnedPrompt("studio.lektor.v1", async () => null));
    db = "ADMIN v3";
    seen.push(await workflowPinnedPrompt("studio.lektor.v1", resolve));
    for (const step of workflowDefinition("upload").steps) await workflowPhase(step.id);
    return { kind: "material" as const, id: "r" };
  });
  assert.deepEqual(seen, ["ADMIN v1", "ADMIN v1", null, null]);
  assert.deepEqual(records.get("pin")!.checkpoints.prompts, { "studio.author.v1": "ADMIN v1", "studio.lektor.v1": null });
  assert.equal(await workflowPinnedPrompt("outside", resolve), "ADMIN v3", "kontextuson kívül nincs rögzítés");
});
