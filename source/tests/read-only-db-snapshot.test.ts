import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { READ_ONLY_BEGIN } from "../scripts/lib/read-only-db";

// PRACTICE-AUDIT-SNAPSHOT (review #640): a csak olvasó mérés minden lekérdezése egy pillanatképet lát.
test("a csak olvasó tranzakció REPEATABLE READ pillanatképpel és READ ONLY módban nyílik", () => {
  assert.match(READ_ONLY_BEGIN, /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/u);
});

test("a withReadOnlyDb a közös nyitó utasítást használja (nincs saját BEGIN READ ONLY)", () => {
  const src = fs.readFileSync("scripts/lib/read-only-db.ts", "utf8");
  const body = src.slice(src.indexOf("export async function withReadOnlyDb"), src.indexOf("export async function withWriteTransaction"));
  assert.match(body, /client\.query\(READ_ONLY_BEGIN\)/u);
  assert.doesNotMatch(body, /"BEGIN READ ONLY"/u);
});
