import assert from "node:assert/strict";
import test from "node:test";

import { SUBJECT_KIND_HINTS, kindShareProblems, subjectKindHintLine, visualKindCounts } from "../shared/visual-kind-plan";
import { VISUAL_PARAMS_CONTRACT, visualParamsContract } from "../shared/lesson-visual-params";
import { PROMPT_ANIM_KINDS } from "../shared/lesson-schema";
import { CATALOG_SUBJECTS } from "../shared/catalog-taxonomy";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (14. szakasz; V23, V24).

test("V23: az ajánlótábla minden katalógus-tantárgyra ≥ 2, a promptban hirdetett fajtát ad", () => {
  for (const subject of CATALOG_SUBJECTS) {
    const kinds = SUBJECT_KIND_HINTS[subject];
    assert.ok(kinds && kinds.length >= 2, subject);
    for (const k of kinds) assert.ok((PROMPT_ANIM_KINDS as readonly string[]).includes(k), `${subject}: ${k} nincs hirdetve`);
  }
  assert.match(subjectKindHintLine("Matematika"), /fraction/u);
  assert.match(subjectKindHintLine("magyar nyelvtan"), /sentenceParts/u);
  assert.equal(subjectKindHintLine("ismeretlen tárgy"), "");
});

test("V23: a paraméter-szerződés KI bájtra a régi; BE a négy fajta alakjával", () => {
  assert.equal(visualParamsContract(false), VISUAL_PARAMS_CONTRACT);
  const on = visualParamsContract(true);
  for (const k of ["fraction —", "map —", "wordBuilder —", "sentenceParts —"]) assert.ok(on.includes(k), k);
  assert.ok(on.startsWith(VISUAL_PARAMS_CONTRACT));
});

test("V23: az ábrakészítő promptja KI bájtra a régi; BE a tantárgyi ajánlást és a négy alakot kéri", async () => {
  const { buildAnimatorPrompt } = await import("../server/studio/step-io");
  const { standardFusionFixture } = await import("../shared/fixtures/lesson-fusion");
  const lesson = standardFusionFixture();
  const map = { title: "T", subject: "matematika", classroom: 5, concepts: [{ localId: "area", examWeight: "core" as const, term: "terület" }] };
  const saved = process.env.STUDIO_LESSON_VARIETY;
  try {
    delete process.env.STUDIO_LESSON_VARIETY;
    const off = buildAnimatorPrompt(lesson, map);
    assert.doesNotMatch(off, /fraction —|TANTÁRGYI ÁBRA-AJÁNLÁS/u);
    process.env.STUDIO_LESSON_VARIETY = "on";
    const on = buildAnimatorPrompt(lesson, map);
    assert.ok(on.includes(subjectKindHintLine("matematika")));
    assert.match(on, /fraction —/u);
    assert.equal(on.replace(`${subjectKindHintLine("matematika")}\n`, "").replace(visualParamsContract(true), VISUAL_PARAMS_CONTRACT), off);
  } finally {
    if (saved === undefined) delete process.env.STUDIO_LESSON_VARIETY; else process.env.STUDIO_LESSON_VARIETY = saved;
  }
});

test("V24: fajta-arány jelzés — 10-ből 5 azonos jelez, 4 nem; a forráshoz kötött ábra nem számít; < 5 ábránál nincs jelzés", () => {
  const lesson = (kinds: Array<[string, boolean?]>) => ({ sections: [{ blocks: kinds.map(([animKind, source]) => ({ kind: "animate", animKind, ...(source ? { sourceVisualId: "v1" } : {}) })) }] });
  const mix = (same: number) => [...Array.from({ length: same }, () => ["process"] as [string]), ...["cycle", "venn", "barChart", "timeline", "map", "fraction"].slice(0, 10 - same).map((k) => [k] as [string])];
  assert.equal(kindShareProblems(lesson(mix(5))).length, 1);
  assert.match(kindShareProblems(lesson(mix(5)))[0], /process/u);
  assert.deepEqual(kindShareProblems(lesson(mix(4))), []);
  assert.deepEqual(kindShareProblems(lesson([["process"], ["process"], ["process"], ["cycle"]])), [], "kevés ábra");
  const withSource = [...mix(4), ["process", true], ["process", true]] as Array<[string, boolean?]>;
  assert.deepEqual(kindShareProblems(lesson(withSource)), [], "a forráshoz kötött nem számít");
  assert.deepEqual(visualKindCounts(lesson([["process"], ["cycle"], ["process", true]])), { process: 1, cycle: 1 });
});

// S6c-v2 (a lánc invariánsa az S5a óta): az ábrakészítő kérése és az ábrafajta-jelzés a FUTÁS rögzített állapotát követi, nem a környezetet.
test("S6c-v2: az ábrakészítő kérése a futás állapotát követi — KI futás BE környezetben bájtra a KI kérés, BE futás KI környezetben a BE kérés", async () => {
  const { buildAnimatorPrompt } = await import("../server/studio/step-io");
  const { runWithLessonVariety } = await import("../server/studio/lesson-variety-flag");
  const { fusionFixture } = await import("../shared/fixtures/lesson-fusion");
  const lesson = fusionFixture();
  const map = { title: lesson.title, subject: lesson.subject, classroom: lesson.classroom, concepts: [{ localId: "c1", examWeight: "core" as const, term: "terület" }] };
  const saved = process.env.STUDIO_LESSON_VARIETY;
  try {
    delete process.env.STUDIO_LESSON_VARIETY;
    const off = buildAnimatorPrompt(lesson, map);
    process.env.STUDIO_LESSON_VARIETY = "on";
    const on = buildAnimatorPrompt(lesson, map);
    assert.notEqual(on, off, "a próba valódi különbséget mér");
    assert.equal(await runWithLessonVariety(false, async () => buildAnimatorPrompt(lesson, map)), off, "KI futás BE környezetben");
    delete process.env.STUDIO_LESSON_VARIETY;
    assert.equal(await runWithLessonVariety(true, async () => buildAnimatorPrompt(lesson, map)), on, "BE futás KI környezetben");
  } finally {
    if (saved === undefined) delete process.env.STUDIO_LESSON_VARIETY; else process.env.STUDIO_LESSON_VARIETY = saved;
  }
});

test("S6c-v2: a motor ábrafajta-jelzése a futás állapotához kötött (szerkezeti őr)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../server/studio/single-run/engine.ts", import.meta.url), "utf8");
  assert.ok(src.includes("if (!pastAnimator && varietyOn) {"), "a jelzés a futás állapotát olvassa");
  assert.equal(src.includes("lessonVarietyEnabled()) {"), false, "a motor futás közben nem olvas környezetet");
});
