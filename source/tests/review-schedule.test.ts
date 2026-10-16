import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDue, nextReview, reviewQueue } from "../shared/review-schedule";

// Websuli Design §7 (docs/specs/2026-10-16-websuli-ismetles.md): a mesterutasítás MVP-képlete.
const now = new Date("2026-10-16T12:00:00.000Z");
const DAY = 86_400_000;

test("„Még gyakorlom”: 10 perc múlva újra esedékes, az ismétlésszám nullázódik", () => {
  const s = nextReview({ intervalDays: 8, repetitions: 4, dueAt: now.toISOString() }, "again", now);
  assert.deepEqual(s, { intervalDays: 0, repetitions: 0, dueAt: new Date(now.getTime() + 10 * 60_000).toISOString() });
  assert.deepEqual(nextReview(null, "again", now).repetitions, 0);
});

test("„Már tudom”: 1 nap, majd duplázás (1, 2, 4, 8, 16, 32), legfeljebb 60 nap", () => {
  let state = null;
  const seen: number[] = [];
  for (let i = 0; i < 9; i++) { state = nextReview(state, "known", now); seen.push(state.intervalDays); }
  assert.deepEqual(seen, [1, 2, 4, 8, 16, 32, 60, 60, 60]);
  assert.equal(state!.repetitions, 9);
  assert.equal(Date.parse(state!.dueAt) - now.getTime(), 60 * DAY);
});

test("az esedékesség időzónától független ISO 8601 pillanat, a megjelenítés hu-HU", () => {
  const s = nextReview(null, "known", now);
  assert.equal(s.dueAt, "2026-10-17T12:00:00.000Z");
  assert.match(formatDue(s.dueAt), /^2026\. október 17\./);
});

test("sorrend: az esedékesek (legkorábbi elöl), utána az újak a lecke sorrendjében; a többi „később”", () => {
  const at = (ms: number) => ({ intervalDays: 1, repetitions: 1, dueAt: new Date(now.getTime() + ms).toISOString() });
  const q = reviewQueue(["a", "b", "c", "d", "e"], { b: at(-5000), d: at(-90_000), e: at(DAY), c: at(2 * DAY) }, now);
  assert.deepEqual(q.due, ["d", "b"]);
  assert.deepEqual(q.fresh, ["a"]);
  assert.deepEqual(q.later.map(l => l.id), ["e", "c"]);
  // A pontosan most esedékes kártya már esedékes.
  assert.deepEqual(reviewQueue(["x"], { x: at(0) }, now).due, ["x"]);
});
