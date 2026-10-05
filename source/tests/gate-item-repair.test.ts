import test from "node:test";
import assert from "node:assert/strict";
import { repairFlaggedBankItems, GATE_REPAIR_MAX_ITEMS, type GateRepairDeps } from "../server/studio/gate-item-repair";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { IAIProvider } from "../server/ai/AIProvider";
import type { Lesson } from "../shared/lesson-schema";

/* Spec 2026-10-05-s9 (S9/3) — a kapunál maradt hibás banktétel orkesztrált újraírása; csak a teljes bank determinisztikus
   ellenőrzése ÉS a független bank-ellenőr ítélete után kerül vissza. Mért: job c1f9d12a (élő próba, Mezopotámia). */

const orchestratorReply = JSON.stringify({ rootCause: "A két opció ugyanazt állítja fordított szórendben.", diagnosis: "A disztraktor nem hamis, csak átrendezett.", correctivePrompt: "A disztraktorok legyenek tartalmilag hamisak (más folyó, más gazdálkodás), ne a helyes válasz átrendezései; pontosan egy opció helyes." });
const orchestratorFactory = (): IAIProvider => ({ name: "stub", model: "o", chat: async () => ({ content: orchestratorReply }), streamChat: async function* () { /* nincs */ }, isAvailable: async () => true }) as IAIProvider;

function setup(overrides: Partial<GateRepairDeps> = {}) {
  const lesson = standardFusionFixture() as Lesson;
  const quiz0 = lesson.experience!.quiz[0] as Record<string, unknown>;
  const fixed = { ...quiz0, question: `${String(quiz0.question)} (javítva)` };
  const deps: GateRepairDeps = {
    providerFactory: orchestratorFactory, keyConfigured: () => true, bankModel: "gpt-5.6-luna", bankSystem: "BANK SKILL",
    callBank: async () => fixed,
    verify: async () => [],
    ...overrides,
  };
  return { lesson, quiz0, fixed, deps };
}
const flag = { path: "experience.quiz[0]", message: "Bank-ellenőr: Egyválasztós tétel: 2 helyes opció a független ítélet szerint" };

test("javítás: az újraírt tétel a determinisztikus ellenőrzés és a független ellenőr után visszakerül", async () => {
  const { lesson, deps } = setup();
  let verifiedPath = "";
  const res = await repairFlaggedBankItems({ lesson, flags: [flag], round: 3, deps: { ...deps, verify: async (_l, p) => { verifiedPath = p; return []; } } });
  assert.ok(res);
  assert.deepEqual(res.repaired, ["experience.quiz[0]"]);
  assert.match(String((res.lesson.experience!.quiz[0] as { question: string }).question), /\(javítva\)$/);
  assert.equal(verifiedPath, "experience.quiz[0]", "a független ellenőr csak ezt az útvonalat nézi");
  assert.notEqual(res.lesson, lesson, "az eredeti lecke nem módosul helyben");
});

test("a független ellenőr ítélete nélkül / hibával NEM kerül vissza (a régi hibaút)", async () => {
  const { lesson, deps } = setup({ verify: async () => ["Egyválasztós tétel: 2 helyes opció"] });
  assert.equal(await repairFlaggedBankItems({ lesson, flags: [flag], round: 3, deps }), null);
});

test("a kötés (id, fejezet, fogalmak, szándék) nem változhat — más tétel nem csempészhető be", async () => {
  const { lesson, quiz0, deps } = setup();
  const swapped = setup({ callBank: async () => ({ ...quiz0, id: "uj-azonosito" }) });
  assert.equal(await repairFlaggedBankItems({ lesson, flags: [flag], round: 3, deps: swapped.deps }), null);
  const moved = setup({ callBank: async () => ({ ...quiz0, sectionIndex: 99 }) });
  assert.equal(await repairFlaggedBankItems({ lesson, flags: [flag], round: 3, deps: moved.deps }), null);
  assert.ok(deps);
});

test("sémát sértő vagy két azonos opciójú tétel elutasítva", async () => {
  const { lesson, quiz0 } = setup();
  const bad = setup({ callBank: async () => ({ ...quiz0, options: ["a", "a", "b"] }) });
  assert.equal(await repairFlaggedBankItems({ lesson, flags: [flag], round: 3, deps: bad.deps }), null);
});

test(`legfeljebb ${GATE_REPAIR_MAX_ITEMS} tétel; nem banktétel-útvonal nem javítható`, async () => {
  const { lesson, deps } = setup();
  const many = Array.from({ length: GATE_REPAIR_MAX_ITEMS + 1 }, (_, i) => ({ path: `experience.quiz[${i}]`, message: "x" }));
  assert.equal(await repairFlaggedBankItems({ lesson, flags: many, round: 3, deps }), null);
  assert.equal(await repairFlaggedBankItems({ lesson, flags: [{ path: "sections[0].blocks[1]", message: "x" }], round: 3, deps }), null);
});

test("S9/4: változatlanul visszaadott tétel → azonnali elutasítás a független ellenőr nélkül; a 2. kör eszkalálható (kör-szám a hívónak)", async () => {
  const { lesson, quiz0 } = setup();
  const rounds: number[] = [];
  let verified = 0;
  const res = await repairFlaggedBankItems({ lesson, flags: [flag], round: 3, deps: setup({
    callBank: async (_s, _u, round) => { rounds.push(round); return round === 1 ? quiz0 : { ...quiz0, question: `${String(quiz0.question)} (2. kör)` }; },
    verify: async () => { verified++; return []; },
  }).deps });
  assert.deepEqual(rounds, [1, 2], "a 2. kör a kör-számmal (a hívó erősebb modellre vált)");
  assert.equal(verified, 1, "a változatlan tételre nem hívtuk a független ellenőrt");
  assert.match(String((res!.lesson.experience!.quiz[0] as { question: string }).question), /\(2\. kör\)$/);
});

test("S9/5 (mért: job c1f9d12a): téves útvonalú jelzés — a jelzett tételt a független ellenőr ítéli meg, a megnevezett tétel javítást kap", async () => {
  const { namedItemRef } = await import("../server/studio/gate-item-repair");
  assert.deepEqual(namedItemRef("Mi hamis: tasks[28] továbbra is csak Tigrist fogad el; tasks[6] javítva. | Bizonyíték: …"), { bank: "tasks", index: 28 });
  assert.deepEqual(namedItemRef("Mi hamis: experience.quiz.3 két helyes opció"), { bank: "quiz", index: 3 });
  assert.equal(namedItemRef("Szabad szöveg tasks[28] említéssel, kötött mező nélkül"), null, "csak a kötött „Mi hamis:” mező számít");

  const { lesson } = setup();
  const t1 = lesson.experience!.tasks[1] as Record<string, unknown>;
  const misFlag = { path: "experience.tasks[0]", message: "Mi hamis: tasks[1] túl szigorú rubrika; tasks[0] javítva. | Bizonyíték: … | Javítás iránya: …" };
  const verified: string[] = [];
  const called: string[] = [];
  const res = await repairFlaggedBankItems({ lesson, flags: [misFlag], round: 3, deps: setup({
    verify: async (_l, p) => { verified.push(p); return []; },
    callBank: async (_s, user) => { called.push(JSON.parse(user).tetel.id); return { ...t1, q: `${String(t1.q)} (javítva)` }; },
  }).deps });
  assert.ok(res);
  assert.deepEqual(res.repaired.sort(), ["experience.tasks[0]", "experience.tasks[1]"]);
  assert.deepEqual(called, [t1.id], "a modell csak a megnevezett (valódi) tételt írja újra");
  assert.ok(verified.includes("experience.tasks[0]"), "a jelzett tételt a független ellenőr ítélte meg");
});

test("S9/5: téves útvonalnál is, ha a független ellenőr a jelzett tételt hibásnak ítéli, az is javító utat kap (nem szűnik meg ellenőrizetlenül)", async () => {
  const { lesson } = setup();
  const t0 = lesson.experience!.tasks[0] as Record<string, unknown>;
  const t1 = lesson.experience!.tasks[1] as Record<string, unknown>;
  const misFlag = { path: "experience.tasks[0]", message: "Mi hamis: tasks[1] hiba. | Bizonyíték: …" };
  const called: string[] = [];
  let first = true;
  const res = await repairFlaggedBankItems({ lesson, flags: [misFlag], round: 3, deps: setup({
    verify: async (_l, p) => { if (p === "experience.tasks[0]" && first) { first = false; return ["valóban hibás"]; } return []; },
    callBank: async (_s, user) => { const id = JSON.parse(user).tetel.id; called.push(id); const src = id === t0.id ? t0 : t1; return { ...src, q: `${String(src.q)} (javítva)` }; },
  }).deps });
  assert.ok(res);
  assert.deepEqual(new Set(called), new Set([t0.id, t1.id]));
});
