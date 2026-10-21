import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric } from "../shared/answer-key-calibrate";
import type { OpenTask } from "../shared/lesson-experience";
import type { AnswerKeyCases } from "../shared/answer-key-tests";
import { LEGACY_REDO, legacySource, retryPayload, shouldRedo } from "../server/studio/legacy-migration";

/* Spec 2026-10-21-ciklus6: a lektor által kifogásolt gépi csoport ne kerüljön vissza + a két elakadt anyag célzott újragyártása. */

// Az S3d-teszt esete: egy szó nem különböztet meg, a csoportos szigorítás igen.
const task = (): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mit tesz az igekötő az igével?",
  required: [["igekötő"], ["ige", "igének", "igét"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "Az igekötő új jelentést ad az igének.", mode: "written",
}) as OpenTask;
const cases: AnswerKeyCases = {
  correct: ["Az igekötő módosítja az ige jelentését.", "Az igekötő megváltoztatja az ige jelentését, például a megy és a kimegy.", "Az igekötő új jelentést ad az igének, irányt is jelölhet."],
  wrong: [{ kind: "forditott", text: "Az igekötő elveszi az ige jelentését." }, { kind: "temaidegen", text: "A macska az asztalon alszik." }],
};

test("ciklus6: a lektor által kifogásolt feladatra nincs csoportos szigorítás; a lektor nélküli építés változatlan", () => {
  const normal = calibrateRubric(task(), cases);
  assert.ok(normal.changes.some((c) => c.startsWith("szigorítás (csoport):")), "előfeltétel: alapból van csoportos szigorítás");
  const reviewed = calibrateRubric(task(), cases, { noCoverGroup: true });
  assert.ok(!reviewed.changes.some((c) => c.startsWith("szigorítás (csoport):")), JSON.stringify(reviewed.changes));
});

test("ciklus6: a célzott újragyártás egyszer fut, az utasítás a forrás mellé kerül, és a jelző az újrapróbán is megmarad", () => {
  const [fonev, tulajdonsag] = Object.keys(LEGACY_REDO);
  assert.equal(Object.keys(LEGACY_REDO).length, 2);
  assert.equal(shouldRedo({ status: "error", payload: { htmlFileId: fonev } }), true);
  assert.equal(shouldRedo({ status: "error", payload: { htmlFileId: fonev, redo: true } }), false, "egyszer");
  assert.equal(shouldRedo({ status: "done", payload: { htmlFileId: tulajdonsag } }), false);
  assert.equal(shouldRedo({ status: "error", payload: { htmlFileId: "mas-anyag" } }), false);
  const src = legacySource({ title: "A főnév", content: "<p>A főnév</p>" }, LEGACY_REDO[fonev]);
  assert.match(src.instructions, /CSAK a kérdezett rag pontos alakját/);
  assert.doesNotMatch(legacySource({ title: "x", content: "<p>x</p>" }).instructions, /CSAK a kérdezett/);
  assert.equal(retryPayload({ htmlFileId: fonev, redo: true, requeued: true }, "r2", 2, 1).redo, true);
});
