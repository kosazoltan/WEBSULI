import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric } from "../shared/answer-key-calibrate";
import type { OpenTask } from "../shared/lesson-experience";
import type { AnswerKeyCases } from "../shared/answer-key-tests";
import { scoringRulesOf, SCORING_RULE_MARK } from "../shared/scoring-rules";
import { LEGACY_REDO, LEGACY_REDO_ROUND, legacySource, retryPayload, shouldRedo } from "../server/studio/legacy-migration";
import { calibrationOptionsFor, hydrateCheckpoint, rememberLektorReviewed } from "../server/studio/experience-builder";

/* Spec 2026-10-21-ciklus6 (+ review #357): a lektor által kifogásolt feladat gépi szigorítás nélkül + a két elakadt anyag célzott újragyártása. */

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

const FONEV = "7f9083e5-b1f9-4fe0-8c94-376ed61d228c";
const TULAJDONSAG = "59f1ce9a-92e5-4908-82fa-1027d82583bf";

test("ciklus6: a lektor által kifogásolt feladatra SEMMILYEN gépi szigorítás; a lektor nélküli építés változatlan", () => {
  const normal = calibrateRubric(task(), cases);
  assert.ok(normal.changes.some((c) => c.startsWith("szigorítás (csoport):")), "előfeltétel: alapból van csoportos szigorítás");
  const reviewed = calibrateRubric(task(), cases, { lektorReviewed: true });
  assert.ok(!reviewed.changes.some((c) => c.startsWith("szigorítás")), JSON.stringify(reviewed.changes));
  assert.deepEqual(reviewed.task.required, task().required);
});

test("review #357: a tiltás körökön átível (checkpoint), és a builder-beállítás a kifogásolt azonosítóra érvényes", () => {
  // 1. lektori kör: A kifogásolva; a bank a következő körre a checkpointból épül újra (hydrateCheckpoint — a valódi út).
  const round1 = hydrateCheckpoint(undefined);
  rememberLektorReviewed(round1, ["A", undefined]);
  const round2 = hydrateCheckpoint(round1);
  assert.deepEqual(round2.lektorReviewedIds, ["A"], "a tiltás átkerül a következő körbe");
  // A 2. lektori kör csak B-t kifogásolja — A tiltása megmarad.
  const all = rememberLektorReviewed(round2, ["B"]);
  assert.deepEqual(round2.lektorReviewedIds, ["A", "B"]);
  // Más módszertan-verziójú (elavult) checkpoint nem hoz át semmit.
  assert.equal(hydrateCheckpoint({ hash: "regi", parts: {}, lektorReviewedIds: ["A"] }).lektorReviewedIds, undefined);
  assert.deepEqual(calibrationOptionsFor("A", all, false), { phrases: false, exactForms: true, lektorReviewed: true });
  assert.deepEqual(calibrationOptionsFor("C", all, true), { phrases: true, exactForms: false, lektorReviewed: false });
  // A teljes út: a builder-beállítással kalibrált, korábban kifogásolt feladat sem kap csoportot.
  const viaBuilder = calibrateRubric({ ...task(), id: "A" }, cases, calibrationOptionsFor("A", all, false));
  assert.ok(!viaBuilder.changes.some((c) => c.startsWith("szigorítás")));
});

test("ciklus6: a célzott újragyártás anyagai és utasításai rögzítettek; egyszer fut; a pontozási szabály a banképítőhöz is eljut", () => {
  assert.deepEqual(Object.keys(LEGACY_REDO).sort(), [FONEV, TULAJDONSAG].sort());
  assert.match(LEGACY_REDO[FONEV], /CSAK a kérdezett rag pontos alakját/);
  assert.match(LEGACY_REDO[TULAJDONSAG], /a mintaválasz többi szava .* soha ne legyen kötelező/);
  assert.equal(shouldRedo({ status: "error", payload: { htmlFileId: FONEV } }), true);
  // Spec 2026-10-21-ciklus7: körönként egyszer — az 1. kör (redo: true) után a 2. kör még jár, utána nem.
  assert.equal(shouldRedo({ status: "error", payload: { htmlFileId: FONEV, redo: true } }), true, "a 2. kör még jár");
  assert.equal(shouldRedo({ status: "error", payload: { htmlFileId: FONEV, redo: LEGACY_REDO_ROUND } }), false, "körönként egyszer");
  assert.equal(shouldRedo({ status: "done", payload: { htmlFileId: TULAJDONSAG } }), false);
  assert.equal(shouldRedo({ status: "error", payload: { htmlFileId: "mas-anyag" } }), false);
  assert.equal(retryPayload({ htmlFileId: FONEV, redo: LEGACY_REDO_ROUND, requeued: true }, "r2", 2, 1).redo, LEGACY_REDO_ROUND);
  const src = legacySource({ title: "A főnév", content: "<p>A főnév</p>" }, LEGACY_REDO[FONEV]);
  // A gyártási utasításból a banképítő pontosan a pontozási szabályt kapja (a forrásolvasó a teljes utasítást).
  assert.equal(scoringRulesOf(src.instructions), `${SCORING_RULE_MARK} ${LEGACY_REDO[FONEV]}`);
  assert.equal(scoringRulesOf(legacySource({ title: "x", content: "<p>x</p>" }).instructions), "");
});
