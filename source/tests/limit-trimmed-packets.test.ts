import { test } from "node:test";
import assert from "node:assert/strict";
import { experienceSchema } from "../shared/lesson-experience";
import { experienceProblems } from "../shared/lesson-experience-validation";
import { resolveChoiceGate } from "../server/studio/step-runner";
import { reconcileBankWithTeaching, withTrimmedSections } from "../server/studio/limit-policy";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { planLessonBank } from "../shared/lesson-bank-plan";
import type { Lesson } from "../shared/lesson-schema";

/* Spec 2026-10-01-limit-csomag-lazitas (tulajdonosi döntés, 1. opció): a limiten a hibás nyílt feladat kivétele után a
   fejezet csomagja lazított — fogalmanként legalább 1 nyílt feladat marad, a többi minimum változatlan. */

// Egyetlen szóbeli feladatú csomag (a többi írásbeli) + egy tartalék írásbeli, hogy a teljes 45-ös minimum ne sérüljön.
const singleOral = () => {
  const lesson = standardFusionFixture();
  const e = lesson.experience!;
  let oralSeen = false;
  const tasks = e.tasks.map((t) => (t.mode === "oral" ? (oralSeen ? { ...t, mode: "written" as const } : ((oralSeen = true), t)) : t));
  const extra = { ...tasks.find((t) => t.mode === "written")!, id: "t-extra", q: "Számold ki még egyszer egy másik háromszög területét!" };
  lesson.experience = { ...e, tasks: [...tasks, extra] };
  return lesson;
};

test("séma: a jelölt fejezetben nem kötelező a szóbeli/írásbeli pár, és fogalom nyílt feladat nélkül is lehet, ha a kvízpár megvan; jelöletlenben a régi szigor", () => {
  const lesson = singleOral();
  const e = lesson.experience!;
  const noOral = { ...e, tasks: e.tasks.filter((t) => t.mode !== "oral") };
  assert.match(JSON.stringify(experienceSchema.safeParse(noOral).error?.issues ?? []), /írásos vagy szóbeli változata hiányos/, "jelöletlen: a régi szigor");
  assert.equal(experienceSchema.safeParse({ ...noOral, bankPlan: { ...noOral.bankPlan!, trimmedSections: [0] } }).success, true, "jelölt fejezet: lazított");
  // Tulajdonosi kiterjesztés (2026-10-01, ingyenes visszajátszás: a kivett feladat a fogalom EGYETLEN feladata volt): a jelölt
  // fejezetben a fogalom feladat nélkül is maradhat, ha a felidéző + alkalmazó kvízkérdése megvan; anélkül hiba.
  const noTask = { ...e, tasks: [], bankPlan: { ...e.bankPlan!, trimmedSections: [0] } };
  assert.doesNotMatch(JSON.stringify(experienceSchema.safeParse(noTask).error?.issues ?? []), /nincs nyílt feladat/);
  assert.match(JSON.stringify(experienceSchema.safeParse({ ...e, tasks: [] }).error?.issues ?? []), /nincs nyílt feladat/, "jelöletlen: hiba");
  const noApply = { ...noTask, quiz: e.quiz.filter((q) => q.intent !== "apply") };
  assert.match(JSON.stringify(experienceSchema.safeParse(noApply).error?.issues ?? []), /hiányzó apply kvíz/, "a kvízpár kötelező marad");
});

test("kapu: a limiten kivett egyetlen szóbeli feladat után a lecke a jelöléssel átmegy; jelölés nélkül elutasítás lenne", () => {
  const lesson = singleOral();
  const oralIndex = lesson.experience!.tasks.findIndex((t) => t.mode === "oral");
  const flag = { path: `experience.tasks[${oralIndex}]`, message: "Bank-ellenőr: a minta nem teljesíti a kötelező csoportot.", origin: "limit" };
  const without = lesson.experience!.tasks.filter((_, i) => i !== oralIndex);
  assert.notDeepEqual(experienceProblems({ ...lesson, experience: { ...lesson.experience!, tasks: without } }), [], "jelölés nélkül a pár hiánya hiba");
  const result = resolveChoiceGate(lesson, [flag]);
  assert.ok("lesson" in result, JSON.stringify(result));
  assert.deepEqual(result.removed, [`experience.tasks[${oralIndex}]`]);
  assert.deepEqual(result.lesson.experience!.bankPlan!.trimmedSections, [0]);
  assert.equal(result.lesson.experience!.tasks.some((t) => t.mode === "oral"), false);
  assert.deepEqual(result.trimmed, [0], "a kapu jelzi a lazítást (minőségi jegyzethez)");
});

test("review #171: nem limit-eredetű (aritmetikai) kivételnél nincs lazítás — a régi szigor marad", () => {
  const lesson = singleOral();
  const oralIndex = lesson.experience!.tasks.findIndex((t) => t.mode === "oral");
  const result = resolveChoiceGate(lesson, [{ path: `experience.tasks[${oralIndex}]`, message: "Nyitott aritmetikai lelet.", origin: "arithmetic" }]);
  assert.ok("error" in result, JSON.stringify(result));
  assert.match(result.error, /írásos vagy szóbeli változata hiányos/);
});

test("withTrimmedSections: egyesít, rendez, bankterv nélkül változatlan", () => {
  const lesson = singleOral();
  const once = withTrimmedSections(lesson, [0]);
  assert.deepEqual(withTrimmedSections(once, [0]).experience!.bankPlan!.trimmedSections, [0]);
  const plain = { ...lesson, experience: { ...lesson.experience!, bankPlan: undefined } };
  assert.equal(withTrimmedSections(plain, [0]), plain);
});

test("2. tulajdonosi kiterjesztés: a jelölt fejezetben a módszer-minimum is lazul; jelöletlenben a régi szigor; a kvízpár marad", () => {
  const e = singleOral().experience!;
  const oneMethod = { ...e, methods: e.methods.filter((m, i, all) => all.findIndex((x) => x.kind === m.kind) === i).slice(0, 1).concat(e.methods.filter((m) => m.kind === "gate").slice(0, 2)) };
  // jelölés nélkül a fejezet-szintű módszerhiány hiba
  const strict = JSON.stringify(experienceSchema.safeParse({ ...oneMethod, methods: oneMethod.methods.slice(0, 1) }).error?.issues ?? []);
  assert.match(strict, /legalább két különböző, releváns módszer kell/);
  const relaxed = JSON.stringify(experienceSchema.safeParse({ ...oneMethod, methods: oneMethod.methods.slice(0, 1), bankPlan: { ...e.bankPlan!, trimmedSections: [0] } }).error?.issues ?? []);
  assert.doesNotMatch(relaxed, /legalább két különböző, releváns módszer kell/, "jelölt fejezet: a módszer-minimum lazul");
});

test("review #173: limit-eredetű MÓDSZER-kivétel → a fejezet lazított, a kapu átmegy; a bankigazítás a módszer fejezetét is jelöli", () => {
  const lesson = standardFusionFixture();
  lesson.sections.push({ heading: "Második fejezet", probaEnabled: false, blocks: [
    { kind: "explain", text: "A háromszög területe az alap és a magasság szorzatának fele.", depth: "core", readAloud: true, coversConceptIds: ["area"] },
    { kind: "recap", bullets: ["Összefoglaló mondat."] },
  ] } as Lesson["sections"][number]);
  const bank = standardFusionFixture().experience!;
  const second = <T extends { id: string; sectionIndex: number }>(item: T, extra: Partial<T>) => ({ ...item, ...extra, id: `${item.id}-s2`, sectionIndex: 1 });
  const kinds = [...new Set(bank.methods.map((m) => m.kind))].filter((k) => k !== "gate").slice(0, 2).map((kind) => bank.methods.find((m) => m.kind === kind)!);
  const oral = bank.tasks.find((t) => t.mode === "oral")!, written = bank.tasks.find((t) => t.mode === "written")!;
  const recall = bank.quiz.find((q) => q.intent === "recall" && q.coversConceptIds.length === 1)!, apply = bank.quiz.find((q) => q.intent === "apply" && q.coversConceptIds.length === 1)!;
  lesson.experience = { ...bank,
    methods: [...bank.methods, ...kinds.map((m) => second(m, { prompt: `${m.prompt} (második fejezet)` }))],
    tasks: [...bank.tasks, second(oral, { q: `${oral.q} (második fejezet)` }), second(written, { q: `${written.q} (második fejezet)` })],
    quiz: [...bank.quiz, second(recall, { question: `${recall.question} (második fejezet)` }), second(apply, { question: `${apply.question} (második fejezet)` })],
  };
  lesson.experience.bankPlan = planLessonBank(lesson, bank.version);
  assert.deepEqual(experienceProblems(lesson), [], "kiinduló állapot rendben");
  const methodIndex = lesson.experience.methods.findIndex((m) => m.id === `${kinds[0].id}-s2`);
  const flag = { path: `experience.methods[${methodIndex}]`, message: "Bank-ellenőr: hibás módszer.", origin: "limit" };
  const result = resolveChoiceGate(lesson, [flag]);
  assert.ok("lesson" in result, JSON.stringify(result));
  assert.deepEqual(result.trimmed, [1], "a 2. fejezet lazított");
  assert.equal(result.lesson.experience!.methods.some((m) => m.id === `${kinds[0].id}-s2`), false);
  assert.match(JSON.stringify(experienceSchema.safeParse({ ...lesson.experience, methods: lesson.experience.methods.filter((_, i) => i !== methodIndex) }).error?.issues ?? []), /legalább két különböző, releváns módszer kell/, "jelölés nélkül hiba lenne");
  // bankigazítás: a fejezetben nem tanított fogalmú módszer kikerül, a fejezete lazítható
  const untaught = { ...lesson, experience: { ...lesson.experience, methods: lesson.experience.methods.map((m, i) => (i === methodIndex ? { ...m, coversConceptIds: ["nem-tanitott"] } : m)) } };
  const fit = reconcileBankWithTeaching(untaught);
  assert.deepEqual(fit.removedItems, [`${kinds[0].id}-s2`]);
  assert.deepEqual(fit.trimSections, [1]);
});
