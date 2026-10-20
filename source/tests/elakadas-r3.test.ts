import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonExperience, issueSignature, STUCK_SAME_ISSUE_RUNS } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";

/* Spec 2026-10-20-elakadas-r3-ismetlodo-hiba — doom-loop: azonos hibalista háromszor → korai tételkivétel, a mentőkör elmarad. */

test("issueSignature: sorrendfüggetlen, szóközt nem számít", () => {
  assert.equal(issueSignature(["b: x", "a: y"]), issueSignature([" a: y", "b: x "]));
  assert.notEqual(issueSignature(["a: y"]), issueSignature(["a: z"]));
  assert.equal(STUCK_SAME_ISSUE_RUNS, 3);
});

test("ugyanaz a javíthatatlan tétel minden kísérletben: a 3. kísérlet után kész (nincs mentőkör), a bank-stuck jelzés megjön", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
  const stuck: string[] = [];
  let calls = 0;
  const experience = await buildLessonExperience({ ...lesson, experience: undefined }, concepts, {
    call: async () => {
      calls++;
      const e = structuredClone(standardFusionFixture().experience!);
      e.tasks.push({ ...e.tasks[0], id: "bad-task", q: `${e.tasks[0].q} (hibás)`, sample: "x" });
      return e;
    },
    onToolFix: (tool, list) => { if (tool === "bank-stuck") stuck.push(...list); },
  });
  assert.equal(calls, STUCK_SAME_ISSUE_RUNS);
  assert.match(stuck.join(" "), /ismétlődő hiba — korai kivétel 1 hibás tétel kivéve/);
  assert.equal(experience.tasks.some((t) => t.q.endsWith("(hibás)")), false);
});

// Review #333: a lenyomat egyértelmű — sortörést tartalmazó, eltérő listák nem esnek egybe.
test("issueSignature: a sortörés nem mos össze két eltérő hibalistát", () => {
  assert.notEqual(issueSignature(["a\nb"]), issueSignature(["a", "b"]));
});
