import assert from "node:assert/strict";
import test from "node:test";

import { answeredCount, snapshotDue, type SnapshotState } from "../shared/quiz-round";

/** B5b (docs/specs/2026-11-25-eredmeny-email-b5b.md, 4. pont): a pillanatkép csak több válasznál megy, mint a körre legutóbb elfogadott. */
test("B5b: answeredCount csak a kör kérdéseinek válaszait számolja", () => {
  assert.equal(answeredCount({ ids: ["a", "b", "c"], picks: { a: 1, c: 0, x: 2 } }), 2);
  assert.equal(answeredCount({ ids: [], picks: {} }), 0);
});

test("B5b: snapshotDue — új kör, több válasz, függő azonos állapot", () => {
  const s: SnapshotState = { sent: null, pending: null };
  assert.equal(snapshotDue(s, "r1", 0), false, "válasz nélkül nem");
  assert.equal(snapshotDue(s, "r1", 2), true, "első pillanatkép");
  s.sent = { roundId: "r1", count: 2 };
  assert.equal(snapshotDue(s, "r1", 2), false, "ugyanaz az állapot nem megy újra");
  assert.equal(snapshotDue(s, "r1", 1), false, "kevesebb sem");
  assert.equal(snapshotDue(s, "r1", 3), true, "több válasz igen");
  assert.equal(snapshotDue(s, "r2", 1), true, "másik kör tiszta lappal");
  s.pending = { roundId: "r1", count: 3 };
  assert.equal(snapshotDue(s, "r1", 3), false, "a függő azonos állapot nem megy kétszer");
  assert.equal(snapshotDue(s, "r1", 4), true, "a függőnél több igen");
});
