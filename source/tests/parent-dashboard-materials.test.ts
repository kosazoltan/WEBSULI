import assert from "node:assert/strict";
import test from "node:test";

import {
  groupMaterialViewsByUser,
  groupLessonResultsByUser,
} from "../server/lib/parent-dashboard";

/**
 * #158 — parent-dashboard: which student viewed which material, and what
 * result they reached per lesson. Pure aggregation, tested without DB.
 */

test("groupMaterialViewsByUser: tanulónként anyagonként darabszám + utolsó megtekintés", () => {
  const out = groupMaterialViewsByUser([
    { userId: "u1", materialId: "m1", title: "Hőtan", viewedAt: "2026-09-01T10:00:00Z" },
    { userId: "u1", materialId: "m1", title: "Hőtan", viewedAt: "2026-09-03T08:00:00Z" },
    { userId: "u1", materialId: "m2", title: "Törtek", viewedAt: "2026-09-02T09:00:00Z" },
    { userId: "u2", materialId: "m1", title: "Hőtan", viewedAt: "2026-09-02T11:00:00Z" },
  ]);
  assert.deepEqual(out.get("u1"), [
    { materialId: "m1", title: "Hőtan", viewCount: 2, lastViewed: "2026-09-03T08:00:00Z" },
    { materialId: "m2", title: "Törtek", viewCount: 1, lastViewed: "2026-09-02T09:00:00Z" },
  ]);
  assert.equal(out.get("u2")?.length, 1);
});

test("groupMaterialViewsByUser: a lista a legutóbbi megtekintés szerint csökkenő", () => {
  const out = groupMaterialViewsByUser([
    { userId: "u1", materialId: "regi", title: "Régi", viewedAt: "2026-08-01T00:00:00Z" },
    { userId: "u1", materialId: "uj", title: "Új", viewedAt: "2026-09-04T00:00:00Z" },
  ]);
  assert.deepEqual(out.get("u1")?.map((m) => m.materialId), ["uj", "regi"]);
});

test("groupMaterialViewsByUser: user nélküli (anonim) sor kimarad", () => {
  const out = groupMaterialViewsByUser([
    { userId: null, materialId: "m1", title: "Hőtan", viewedAt: "2026-09-01T00:00:00Z" },
  ]);
  assert.equal(out.size, 0);
});

test("groupLessonResultsByUser: leckénként összes/helyes + százalék", () => {
  const out = groupLessonResultsByUser([
    { userId: "u1", lessonId: "l1", lessonTitle: "A sejt", correct: true },
    { userId: "u1", lessonId: "l1", lessonTitle: "A sejt", correct: false },
    { userId: "u1", lessonId: "l1", lessonTitle: "A sejt", correct: true },
    { userId: "u1", lessonId: "l2", lessonTitle: "Törtek", correct: false },
  ]);
  assert.deepEqual(out.get("u1"), [
    { lessonId: "l1", lessonTitle: "A sejt", total: 3, correct: 2, percent: 67 },
    { lessonId: "l2", lessonTitle: "Törtek", total: 1, correct: 0, percent: 0 },
  ]);
});

test("groupLessonResultsByUser: üres bemenet üres map", () => {
  assert.equal(groupLessonResultsByUser([]).size, 0);
});
