import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableConfig } from "drizzle-orm/pg-core";
import { lessonResultPending } from "../shared/schema";

// Review #585: a Drizzle-séma a 0047-es migráció három CHECK-jét azonos néven hordozza (sémaexportból létrehozott táblán is él).
test("lesson_result_pending: a három CHECK a sémában, a migrációval azonos néven", () => {
  const names = getTableConfig(lessonResultPending).checks.map((c) => c.name).sort();
  assert.deepEqual(names, ["lesson_result_pending_kind_check", "lesson_result_pending_open_has_content", "lesson_result_pending_sent_reason_check"]);
});
