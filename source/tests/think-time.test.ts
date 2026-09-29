import assert from "node:assert/strict";
import test from "node:test";

import {
  QUESTION_SECONDS,
  ROUND_SECONDS,
  TARGET_CORRECT,
  questionSecondsForBand,
  type SpeedGrade,
} from "../client/src/game-engine/speedQuizTiming";

// Spec 2026-09-29-tobb-gondolkodasi-ido: fejben is ki lehessen számolni a feladatot.
const GRADES: SpeedGrade[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const BANDS = [0, 0.25, 0.5, 0.75, 1];

test("E1 Villám matek: a kérdésidő minden sávon ≥ 20 s és ≥ az évfolyam alapideje", () => {
  for (const g of GRADES) {
    for (const band of BANDS) {
      const s = questionSecondsForBand(g, band);
      assert.ok(s >= 20, `${g}. évf., sáv ${band}: ${s} s < 20 s`);
      assert.ok(s >= QUESTION_SECONDS[g], `${g}. évf., sáv ${band}: ${s} s < alapidő ${QUESTION_SECONDS[g]} s`);
    }
  }
});

test("E1 Villám matek: az alapidő az évfolyammal nem csökken", () => {
  for (let i = 1; i < GRADES.length; i++) {
    assert.ok(QUESTION_SECONDS[GRADES[i]] >= QUESTION_SECONDS[GRADES[i - 1]], `${GRADES[i]}. évf. rövidebb, mint az előző`);
  }
});

test("E2 Villám matek: a kör célkérdésenként ≥ 12 s-ot ad", () => {
  for (const g of GRADES) {
    const perTarget = ROUND_SECONDS[g] / TARGET_CORRECT[g];
    assert.ok(perTarget >= 12, `${g}. évf.: ${ROUND_SECONDS[g]} s / ${TARGET_CORRECT[g]} = ${perTarget.toFixed(1)} s`);
  }
});
