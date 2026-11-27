import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { READ_ONLY_BEGIN, READ_ONLY_BEGIN_DEFAULT, runReadOnly } from "../scripts/lib/read-only-db";

// PRACTICE-AUDIT-SNAPSHOT (review #640/#641): a tényleges utasítássorrend — az ELSŐ tranzakciót nyitó utasítás a kért szint.
const fake = () => {
  const sent: string[] = [];
  return { sent, client: { query: async (sql: string) => { sent.push(sql); return { rows: [] }; } } };
};

test("pillanatkép kérésre az első utasítás a REPEATABLE READ READ ONLY nyitás, a végén ROLLBACK", async () => {
  const { sent, client } = fake();
  await runReadOnly(client, async (query) => { await query("SELECT 1"); await query("SELECT 2"); }, { snapshot: true });
  assert.equal(READ_ONLY_BEGIN, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.deepEqual(sent, [READ_ONLY_BEGIN, "SELECT 1", "SELECT 2", "ROLLBACK"]);
});

test("alapértelmezésben READ COMMITTED csak olvasó (a hosszú szkriptek nem tartják vissza a VACUUM-ot); hibánál is ROLLBACK", async () => {
  const { sent, client } = fake();
  await assert.rejects(runReadOnly(client, async () => { throw new Error("x"); }));
  assert.deepEqual(sent, [READ_ONLY_BEGIN_DEFAULT, "ROLLBACK"]);
});

test("a practice-audit pillanatképet kér, és a besorolás a tranzakción kívül fut", () => {
  const src = fs.readFileSync("scripts/measure/practice-audit.mts", "utf8");
  assert.match(src, /\}, \{ snapshot: true \}\);/u);
  assert.doesNotMatch(src, /\(BEGIN READ ONLY\)/u);
});
