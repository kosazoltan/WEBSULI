import { test } from "node:test";
import assert from "node:assert/strict";
import { learningStreak, streakMessage } from "../shared/learner-streak";

// docs/specs/2026-10-18-tanuloi-profil.md (S3): napi tanulási sorozat budapesti napokkal.
test("sorozat: üres, csak ma, csak tegnap, megszakadt", () => {
  assert.deepEqual(learningStreak([], "2026-10-18"), { days: 0, today: false });
  assert.deepEqual(learningStreak(["2026-10-18"], "2026-10-18"), { days: 1, today: true });
  assert.deepEqual(learningStreak(["2026-10-17", "2026-10-16"], "2026-10-18"), { days: 2, today: false });
  assert.deepEqual(learningStreak(["2026-10-16", "2026-10-15"], "2026-10-18"), { days: 0, today: false });
  assert.deepEqual(learningStreak(["2026-10-18", "2026-10-17", "2026-10-15"], "2026-10-18"), { days: 2, today: true });
});

test("sorozat: hónap- és évváltás, ismétlődő nap", () => {
  assert.deepEqual(learningStreak(["2026-11-01", "2026-10-31", "2026-10-30"], "2026-11-01"), { days: 3, today: true });
  assert.deepEqual(learningStreak(["2027-01-01", "2026-12-31", "2026-12-31"], "2027-01-01"), { days: 2, today: true });
  assert.deepEqual(learningStreak(["2028-03-01", "2028-02-29", "2028-02-28"], "2028-03-01"), { days: 3, today: true });
});

test("üzenetek", () => {
  assert.equal(streakMessage(null), null);
  assert.equal(streakMessage({ days: 0, today: false }), null);
  assert.equal(streakMessage({ days: 1, today: true }), "Ma már tanultál — szuper!");
  assert.equal(streakMessage({ days: 5, today: true }), "5 napja tanulsz egymás után!");
  assert.equal(streakMessage({ days: 3, today: false }), "3 napos sorozatod van — ma is folytasd!");
});

test("review #303: a profil (sorozat) nem ragad be — rövid frissesség, fókuszra és látható lapon 5 percenként újralekérés", async () => {
  const { LEARNER_PROFILE_QUERY_OPTIONS } = await import("../client/src/lib/learnerProfile");
  assert.ok(LEARNER_PROFILE_QUERY_OPTIONS.staleTime <= 60_000);
  assert.equal(LEARNER_PROFILE_QUERY_OPTIONS.refetchOnWindowFocus, true);
  assert.ok(LEARNER_PROFILE_QUERY_OPTIONS.refetchInterval <= 5 * 60_000, "a budapesti napváltás legkésőbb 5 perc múlva látszik");
  assert.equal(LEARNER_PROFILE_QUERY_OPTIONS.refetchIntervalInBackground, false);
});
