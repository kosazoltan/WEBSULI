import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { bankProgressText, SINGLE_RUN_BANK_CONCURRENCY, singleRunBankConcurrency } from "../server/studio/single-run/engine";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { lessonSchema } from "../shared/lesson-schema";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* docs/specs/2026-10-16-parhuzamos-bank.md: a gyakorlóbank egységei párhuzamosan; a haladásjelzés a készülő csomagokat megnevezi. */

/*
 * KB #206: a késleltetések (5 / 20 / 30 ms) hamis órán futnak. A valódi időzítőkkel a befejezési sorrendet terhelés alatt az
 * ütemező döntötte el (a teljes körben hamis bukás, egyedül zöld). Itt a függő munka előbb teljesen lefut (valódi setImmediate),
 * és csak utána lép az óra 1 ms-ot — a sorrendet kizárólag a késleltetések értéke adja.
 */
const settle = async () => {
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
};

/*
 * Review PR #547 (Sourcery): ha a művelet a lépéskorlát után is függőben van (pl. egy időzítő a korláton túl vagy soha nem
 * jár le), a segéd kifejezett hibával bukik — a hamis órán a teszt különben csendben a node:test időkorlátjáig lógna.
 */
async function onFakeClock<T>(t: TestContext, run: () => Promise<T>, maxTicks = 10_000): Promise<T> {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let settled = false;
  const result = run();
  result.then(() => { settled = true; }, () => { settled = true; });
  for (let step = 0; !settled && step < maxTicks; step++) {
    await settle();
    t.mock.timers.tick(1);
  }
  await settle();
  if (!settled) throw new Error(`onFakeClock: a művelet ${maxTicks} hamis ms után is függőben van`);
  return result;
}

test("onFakeClock: a lépéskorlát után is függő művelet kifejezett hibával bukik (nem lóg)", async (t) => {
  // Alteszt esetenként: a hamis óra tesztenként egyszer kapcsolható be.
  await t.test("soha le nem záruló ígéret", async (st) => {
    await assert.rejects(onFakeClock(st, () => new Promise<never>(() => {}), 5), /5 hamis ms után is függőben van/);
  });
  await t.test("korláton túli időzítő", async (st) => {
    await assert.rejects(onFakeClock(st, () => new Promise((r) => setTimeout(r, 50)), 5), /függőben van/);
  });
  await t.test("korláton belüli időzítő lefut", async (st) => {
    assert.equal(await onFakeClock(st, () => new Promise<string>((r) => setTimeout(() => r("kész"), 3)), 5), "kész");
  });
});

test("a párhuzamosság kapcsolója: alap 3, 1–5 között felülírható, érvénytelen érték → alap", () => {
  assert.equal(SINGLE_RUN_BANK_CONCURRENCY, 3);
  assert.equal(singleRunBankConcurrency({}), 3);
  assert.equal(singleRunBankConcurrency({ STUDIO_BANK_CONCURRENCY: "1" }), 1, "1 = a korábbi soros viselkedés");
  assert.equal(singleRunBankConcurrency({ STUDIO_BANK_CONCURRENCY: "5" }), 5);
  for (const bad of ["0", "6", "2.5", "-1", "sok", ""]) assert.equal(singleRunBankConcurrency({ STUDIO_BANK_CONCURRENCY: bad }), 3, bad);
});

test("haladásszöveg: egy vagy több készülő csomag, ismétlődő fejezet nélkül", () => {
  assert.equal(bankProgressText("Gyakorlóbank", { done: 0, total: 5, building: [0, 1, 2] }), "Gyakorlóbank: 0/5 csomag kész — a 1., 2., 3. fejezet csomagjai készülnek…");
  assert.equal(bankProgressText("Gyakorlóbank", { done: 3, total: 5, building: [3, 3] }), "Gyakorlóbank: 3/5 csomag kész — a 4. fejezet csomagja készül…");
  assert.equal(bankProgressText("Gyakorlóbank", { done: 2, total: 5, current: 2 }), "Gyakorlóbank: 2/5 csomag kész — a 3. fejezet csomagja készül…", "visszafelé kompatibilis");
  assert.equal(bankProgressText("Gyakorlóbank", { done: 5, total: 5 }), "Gyakorlóbank: 5/5 csomag kész…");
});

test("a banképítő haladása a párhuzamosan készülő egységeket adja (building), a kész darab a csomag után nő", async (t) => {
  const base = standardFusionFixture(), e = base.experience!;
  const lesson = lessonSchema.parse({ ...base, experience: undefined, sections: [base.sections[0], { ...base.sections[0], heading: "Második fejezet ugyanarról" }] });
  const packetFor = (sectionIndex: number) => ({
    methods: e.methods.map((m) => ({ ...m, sectionIndex, title: `${m.title} ${sectionIndex}`, prompt: `${m.prompt} ${sectionIndex}` })),
    tasks: e.tasks.map((t) => ({ ...t, sectionIndex, q: `${t.q} (${sectionIndex}. fejezet)` })),
    quiz: e.quiz.map((q) => ({ ...q, sectionIndex, question: `${q.question} (${sectionIndex}. fejezet)` })),
    glossary: [],
  });
  let inFlight = 0, maxInFlight = 0;
  const progress: Array<{ done: number; total: number; building?: number[] }> = [];
  await onFakeClock(t, () => buildLessonExperience(lesson, [], { concurrency: 3, onProgress: (p) => progress.push(p), call: async (_s, user) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return packetFor(Number(/sectionIndex=(\d+)/.exec(user)![1]));
  } }));
  assert.equal(maxInFlight, 2, "a két egység egyszerre épült");
  assert.deepEqual(progress[0], { done: 0, total: 2, current: 0, building: [0, 1] });
  assert.deepEqual(progress.at(-1), { done: 2, total: 2 });
});

// Review #265
const twoSectionLesson = () => {
  const base = standardFusionFixture();
  return { e: base.experience!, lesson: lessonSchema.parse({ ...base, experience: undefined, sections: [base.sections[0], { ...base.sections[0], heading: "Második fejezet ugyanarról" }] }) };
};

test("review #265: a haladás a valóban futó egységeket követi — eltérő befejezési sorrendnél és ütköző csomag soros újraépítésénél is", async (t) => {
  const { e, lesson } = twoSectionLesson();
  const calls: number[] = [];
  const progress: Array<{ done: number; total: number; current?: number; building?: number[] }> = [];
  await onFakeClock(t, () => buildLessonExperience(lesson, [], { concurrency: 3, onProgress: (p) => progress.push(p), call: async (_s, user) => {
    const sectionIndex = Number(/sectionIndex=(\d+)/.exec(user)![1]);
    calls.push(sectionIndex);
    await new Promise((r) => setTimeout(r, sectionIndex === 0 ? 30 : 5)); // a 2. egység (index 1) végez előbb
    const rebuild = calls.filter((s) => s === sectionIndex).length > 1;
    const suffix = rebuild ? " (második változat)" : "";
    // Első körben ugyanazok a kérdések → ütközés → a 2. egység sorosan újraépül.
    return { methods: e.methods.map((m) => ({ ...m, sectionIndex, title: m.title + suffix, prompt: m.prompt + suffix })), tasks: e.tasks.map((t) => ({ ...t, sectionIndex, q: t.q + suffix })),
      quiz: e.quiz.map((q) => ({ ...q, sectionIndex, question: q.question + suffix })), glossary: [] };
  } }));
  assert.deepEqual(progress[0], { done: 0, total: 2, current: 0, building: [0, 1] });
  assert.deepEqual(progress[1], { done: 1, total: 2, current: 0, building: [0] }, "az elsőként végző egység kikerül a készülők közül");
  assert.ok(progress.some((p) => p.done === 1 && p.building?.length === 1 && p.building[0] === 1), "az ütköző csomag soros újraépítése is jelzés: " + JSON.stringify(progress));
  assert.deepEqual(progress.at(-1), { done: 2, total: 2 });
});

test("review #265: az egyik egység hibája után is megvárja a többit és a checkpoint-mentésüket (a kifizetett csomag nem vész el)", async (t) => {
  const { e, lesson } = twoSectionLesson();
  const saved: number[] = [];
  let doneAtReject = -1;
  await assert.rejects(onFakeClock(t, () => buildLessonExperience(lesson, [], { concurrency: 3,
    save: async (cp) => { saved.push(Object.keys(cp.parts).length); },
    call: async (_s, user) => {
      const sectionIndex = Number(/sectionIndex=(\d+)/.exec(user)![1]);
      if (sectionIndex === 0) throw new Error("szolgáltatói hiba (nem javítható)");
      await new Promise((r) => setTimeout(r, 20));
      return { methods: e.methods.map((m) => ({ ...m, sectionIndex })), tasks: e.tasks.map((t) => ({ ...t, sectionIndex })), quiz: e.quiz.map((q) => ({ ...q, sectionIndex })), glossary: [] };
    } })).catch((error) => { doneAtReject = saved.length; throw error; }), /szolgáltatói hiba/);
  assert.equal(doneAtReject, 1, "a hiba csak a késleltetett, sikeres csomag mentése UTÁN megy tovább");
});
