import assert from "node:assert/strict";
import test from "node:test";

import {
  conceptStatRows,
  feedbackPanelVisible,
  quizExportDisabledReason,
  type ConceptStat,
} from "../shared/studio-ui";

/**
 * LS-5b — the feedback panel's pure view-model (concept stats, fix button
 * state, quiz-export guard). Same discipline as the other studio-ui helpers:
 * unit-tested without jsdom, the component only renders these.
 */

const STATS: ConceptStat[] = [
  { conceptId: "c1", total: 10, correct: 9, rate: 0.9 },
  { conceptId: "c2", total: 8, correct: 3, rate: 0.375 },
  { conceptId: "c3", total: 1, correct: 0, rate: 0 },
];

test("conceptStatRows: százalék-címke és gyenge-jelölés a küszöb szerint", () => {
  const rows = conceptStatRows(STATS, 0.7);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    conceptId: "c1",
    label: "c1 — 9/10 (90%)",
    weak: false,
    fixable: true,
  });
  assert.equal(rows[1].weak, true, "c2 a küszöb alatt gyenge");
  assert.match(rows[1].label, /38%/, "kerekített százalék");
});

test("conceptStatRows: kevés mérés nem gyenge, de javítható", () => {
  const rows = conceptStatRows(STATS, 0.7, { minTotal: 5 });
  const c3 = rows.find((r) => r.conceptId === "c3");
  assert.ok(c3);
  assert.equal(c3.weak, false, "1 mérésből nem riasztunk");
  assert.equal(c3.fixable, true, "a fix gomb ettől még kérhető");
});

test("feedbackPanelVisible: csak kész (done) job és létező lessonId mellett", () => {
  assert.equal(feedbackPanelVisible("done", "lesson-1"), true);
  assert.equal(feedbackPanelVisible("done", null), false);
  assert.equal(feedbackPanelVisible("lektor", "lesson-1"), false);
  assert.equal(feedbackPanelVisible("error", "lesson-1"), false);
});

test("quizExportDisabledReason: játék nélkül és üres statisztikával indokol", () => {
  assert.equal(quizExportDisabledReason("", STATS), "Válassz játékot az exporthoz.");
  assert.equal(quizExportDisabledReason("space", STATS), null, "játék kiválasztva: mehet");
  assert.match(quizExportDisabledReason("space", []) ?? "", /nincs.*eredmény/i);
});

// Audit 2026-09-05 (szelet E): a hibás lekérés NEM "nincs adat" — külön hiba-ág + Újra gomb.
test("FeedbackPanel: isError ág külön renderelődik, az üres-állapot csak hiba nélkül", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../client/src/components/studio/FeedbackPanel.tsx", import.meta.url), "utf8");
  assert.match(src, /isError:\s*statsError/);
  assert.match(src, /data-testid="feedback-error"/);
  assert.match(src, /!statsLoading && !statsError && rows\.length === 0/);
});
