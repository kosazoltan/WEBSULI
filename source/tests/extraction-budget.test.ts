import { test } from "node:test";
import assert from "node:assert/strict";
import { completeWithinBudget, EXTRACTION_TOKEN_BUDGETS } from "../server/studio/run-extraction";

const reply = (finish_reason: string) => ({ choices: [{ finish_reason }] });

test("csonka (length) első válasz → egyszer nagyobb kerettel újrakérdez, és a stop választ adja", async () => {
  const asked: number[] = [];
  const r = await completeWithinBudget(async (n) => { asked.push(n); return reply(asked.length === 1 ? "length" : "stop"); });
  assert.deepEqual(asked, [...EXTRACTION_TOKEN_BUDGETS]);
  assert.equal(r.choices[0].finish_reason, "stop");
});

test("a második válasz is csonka → csonkolt-jegyzék hiba", async () => {
  await assert.rejects(completeWithinBudget(async () => reply("length")), /csonkolt jegyzék nem menthető/);
});

test("nem length okú befejezés → nincs újrakérdezés", async () => {
  let calls = 0;
  await assert.rejects(completeWithinBudget(async () => { calls++; return reply("content_filter"); }), /csonkolt jegyzék/);
  assert.equal(calls, 1);
});
