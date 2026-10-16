import test from "node:test";
import assert from "node:assert/strict";
import { bankProgressText, SINGLE_RUN_BANK_CONCURRENCY, singleRunBankConcurrency } from "../server/studio/single-run/engine";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { lessonSchema } from "../shared/lesson-schema";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* docs/specs/2026-10-16-parhuzamos-bank.md: a gyakorlóbank egységei párhuzamosan; a haladásjelzés a készülő csomagokat megnevezi. */

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

test("a banképítő haladása a párhuzamosan készülő egységeket adja (building), a kész darab a csomag után nő", async () => {
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
  await buildLessonExperience(lesson, [], { concurrency: 3, onProgress: (p) => progress.push(p), call: async (_s, user) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return packetFor(Number(/sectionIndex=(\d+)/.exec(user)![1]));
  } });
  assert.equal(maxInFlight, 2, "a két egység egyszerre épült");
  assert.deepEqual(progress[0], { done: 0, total: 2, current: 0, building: [0, 1] });
  assert.deepEqual(progress.at(-1), { done: 2, total: 2 });
});
