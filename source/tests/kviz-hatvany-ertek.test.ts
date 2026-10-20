import test from "node:test";
import assert from "node:assert/strict";
import { quizCorrectIndexProblems } from "../server/studio/experience-builder";

/* Spec 2026-10-20-kviz-hatvany-ertek: a kvíz-kulcsellenőrzés a hatványalak ÉRTÉKÉT olvassa (mért: job be3bd5d2). */

// (3 + 4)² = ? — helyes: 49; disztraktorok: 7 (elfelejtett négyzetre emelés), 25 (3² + 4²), 14.
const base = { id: "q1", options: ["7", "25", "49", "14"], correctIndex: 2, feedbackPerOption: ["Ez csak az összeg.", "A 2ab tag hiányzik.", "", "Ez 2·7."] };

test("a helyes 49 magyarázata „(3 + 4)² = 7²” — a 7² értéke 49, nincs hamis jelzés", () => {
  assert.deepEqual(quizCorrectIndexProblems([{ ...base, feedbackPerOption: base.feedbackPerOption.map((f, i) => (i === 2 ? "Helyes: (3 + 4)² = 7², azaz 3² + 2·3·4 + 4²." : f)) }]), []);
});

test("a „7^2” (kalap) és a „7 ^ 2” alak is értékként számít", () => {
  for (const text of ["Helyes: 7^2.", "Helyes: 7 ^ 2, ez a négyzet."]) {
    assert.deepEqual(quizCorrectIndexProblems([{ ...base, feedbackPerOption: base.feedbackPerOption.map((f, i) => (i === 2 ? text : f)) }]), [], text);
  }
});

test("a valódi ellentmondás továbbra is jelez (a magyarázat egy másik opció értékét mondja helyesnek)", () => {
  const wrong = quizCorrectIndexProblems([{ ...base, feedbackPerOption: base.feedbackPerOption.map((f, i) => (i === 2 ? "Helyes: az eredmény 25." : f)) }]);
  assert.equal(wrong.length, 1);
  assert.match(wrong[0], /49 opciót jelöli, a magyarázata viszont 25/);
});

test("betűs alap (x²) és a felső index nélküli számok változatlanok", () => {
  const q = { id: "q2", options: ["9", "6", "3"], correctIndex: 0, feedbackPerOption: ["Helyes: x² helyére 3-at írva 3·3.", "Nem.", "Nem."] };
  // A helyes (9) magyarázata a 3-at említi, a 9-et nem → a meglévő szabály szerint jelez (az x² nem változtat rajta).
  assert.equal(quizCorrectIndexProblems([q]).length, 1);
});
