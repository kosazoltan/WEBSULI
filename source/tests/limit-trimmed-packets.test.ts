import { test } from "node:test";
import assert from "node:assert/strict";
import { experienceSchema } from "../shared/lesson-experience";
import { experienceProblems } from "../shared/lesson-experience-validation";
import { resolveChoiceGate } from "../server/studio/step-runner";
import { withTrimmedSections } from "../server/studio/limit-policy";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

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

test("séma: a jelölt fejezetben nem kötelező a szóbeli/írásbeli pár; jelöletlen fejezetben igen; feladat nélküli fogalom mindig hiba", () => {
  const lesson = singleOral();
  const e = lesson.experience!;
  const noOral = { ...e, tasks: e.tasks.filter((t) => t.mode !== "oral") };
  assert.match(JSON.stringify(experienceSchema.safeParse(noOral).error?.issues ?? []), /írásos vagy szóbeli változata hiányos/, "jelöletlen: a régi szigor");
  assert.equal(experienceSchema.safeParse({ ...noOral, bankPlan: { ...noOral.bankPlan!, trimmedSections: [0] } }).success, true, "jelölt fejezet: lazított");
  const noTask = { ...e, tasks: [], bankPlan: { ...e.bankPlan!, trimmedSections: [0] } };
  assert.match(JSON.stringify(experienceSchema.safeParse(noTask).error?.issues ?? []), /nincs nyílt feladat/, "fogalom feladat nélkül → hiba");
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
