import test from "node:test";
import assert from "node:assert/strict";
import { repairFlaggedBankItems, GATE_REPAIR_MAX_ITEMS, GATE_REPAIR_MAX_BATCHES, gateRepairBatches, type GateRepairDeps } from "../server/studio/gate-item-repair";
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

// Spec S11/6 + S9/7 (dokumentált spec-változás, mért: job 8953db4b): a keret ${GATE_REPAIR_MAX_ITEMS} tételes ADAG × ${GATE_REPAIR_MAX_BATCHES} adag.
test(`legfeljebb ${GATE_REPAIR_MAX_BATCHES} × ${GATE_REPAIR_MAX_ITEMS} tétel; nem banktétel-útvonal nem javítható`, async () => {
  const { lesson, deps } = setup();
  const many = Array.from({ length: GATE_REPAIR_MAX_ITEMS * GATE_REPAIR_MAX_BATCHES + 1 }, (_, i) => ({ path: `experience.quiz[${i}]`, message: "x" }));
  let calls = 0;
  assert.equal(await repairFlaggedBankItems({ lesson, flags: many, round: 3, deps: { ...deps, callBank: async () => { calls++; return {}; } } }), null);
  assert.equal(calls, 0, "a keret fölött modellhívás nélkül, naplózva marad ki");
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

test("review #192/7: téves útvonalnál a jelzett tétel javítása a független ellenőr ÍTÉLETÉT kapja, nem a más tételt megnevező üzenetet", async () => {
  const { lesson } = setup();
  const t0 = lesson.experience!.tasks[0] as Record<string, unknown>;
  const t1 = lesson.experience!.tasks[1] as Record<string, unknown>;
  const misFlag = { path: "experience.tasks[0]", message: "Mi hamis: tasks[1] hiba. | Bizonyíték: …" };
  const hibaById = new Map<string, string>();
  let first = true;
  const res = await repairFlaggedBankItems({ lesson, flags: [misFlag], round: 3, deps: setup({
    verify: async (_l, p) => { if (p === "experience.tasks[0]" && first) { first = false; return ["a mintaválasz ellentmond a rubrikának"]; } return []; },
    callBank: async (_s, user) => { const u = JSON.parse(user); hibaById.set(u.tetel.id, u.hiba); const src = u.tetel.id === t0.id ? t0 : t1; return { ...src, q: `${String(src.q)} (javítva)` }; },
  }).deps });
  assert.ok(res);
  assert.equal(hibaById.get(String(t0.id)), "a mintaválasz ellentmond a rubrikának");
  assert.equal(hibaById.get(String(t1.id)), misFlag.message, "a megnevezett tétel az eredeti üzenetet kapja");
});

test("review #192/8: két egyszerre hibás tétel — az első javítását a második (még javítatlan) hibája nem buktatja; mindkettő javul", async () => {
  const { experienceProblems } = await import("../shared/lesson-experience-validation");
  const { lesson } = setup();
  const good0 = lesson.experience!.tasks[0] as Record<string, unknown>;
  const good1 = lesson.experience!.tasks[1] as Record<string, unknown>;
  assert.deepEqual(experienceProblems(lesson), [], "a fixture bankja hibátlan");
  const broken = structuredClone(lesson);
  (broken.experience!.tasks[0] as Record<string, unknown>).sample = "zzz";
  (broken.experience!.tasks[1] as Record<string, unknown>).sample = "zzz";
  assert.equal(experienceProblems(broken).length, 2, "mindkét tétel saját mintaválasza hibás");
  const flags = [{ path: "experience.tasks[0]", message: "mintaválasz hibás" }, { path: "experience.tasks[1]", message: "mintaválasz hibás" }];
  const res = await repairFlaggedBankItems({ lesson: broken, flags, round: 3, deps: setup({
    callBank: async (_s, user) => { const id = JSON.parse(user).tetel.id; const src = id === good0.id ? good0 : good1; return { ...src, q: `${String(src.q)} (javítva)` }; },
  }).deps });
  assert.ok(res, "mindkét tétel javítható");
  assert.deepEqual(res.repaired, ["experience.tasks[0]", "experience.tasks[1]"]);
  assert.deepEqual(experienceProblems(res.lesson), []);
  // a végső teljes ellenőrzés: ha a második javítás nem sikerül, nincs részleges eredmény
  const half = await repairFlaggedBankItems({ lesson: broken, flags, round: 3, deps: setup({
    callBank: async (_s, user) => { const id = JSON.parse(user).tetel.id; return id === good0.id ? { ...good0, q: `${String(good0.q)} (javítva)` } : { ...(broken.experience!.tasks[1] as Record<string, unknown>), q: "még mindig rossz" }; },
  }).deps });
  assert.equal(half, null);
});

test("S11/6 + S9/7 (mért: job 8953db4b, 6 cél NÉMÁN kimaradt): 6 cél → 2 adag (5 + 1), mind javítva; a 2. adag bukása → nincs részleges eredmény", async () => {
  assert.deepEqual(gateRepairBatches([1, 2, 3, 4, 5, 6])?.map((b) => b.length), [5, 1]);
  assert.equal(gateRepairBatches(Array.from({ length: 11 }, (_, i) => i)), null);
  const { lesson } = setup();
  const byId = new Map((lesson.experience!.quiz as Array<Record<string, unknown>>).map((q) => [String(q.id), q]));
  const flags = Array.from({ length: 6 }, (_, i) => ({ path: `experience.quiz[${i}]`, message: "Egyválasztós tétel: 2 helyes opció" }));
  const fix = (id: string) => { const q = byId.get(id)!; return { ...q, question: `${String(q.question)} (javítva)` }; };
  const res = await repairFlaggedBankItems({ lesson, flags, round: 3, deps: setup({ callBank: async (_s, user) => fix(JSON.parse(user).tetel.id) }).deps });
  assert.ok(res, "6 cél két adagban javítható");
  assert.equal(res.batches, 2);
  assert.deepEqual(res.repaired, flags.map((f) => f.path));
  for (let i = 0; i < 6; i++) assert.match(String((res.lesson.experience!.quiz[i] as { question: string }).question), /\(javítva\)$/);
  const sixth = String((lesson.experience!.quiz[5] as { id: string }).id);
  const failing = await repairFlaggedBankItems({ lesson, flags, round: 3, deps: setup({
    callBank: async (_s, user) => fix(JSON.parse(user).tetel.id),
    verify: async (_l, p) => (p === "experience.quiz[5]" ? [`${sixth}: még mindig két helyes opció`] : []),
  }).deps });
  assert.equal(failing, null, "a 2. adag bukása a régi hibaút (az 1. adag javítása sem kerül vissza)");
});
