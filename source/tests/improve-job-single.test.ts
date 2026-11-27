import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// IMPROVE-JOB-DUP (review #640): a javítás-job foglalása atomikus — két egyszerre érkező kérésből csak egy job indul.
test("a job-beszúrás tranzakciós tanácsadó zárral és a zár alatti újraellenőrzéssel történik", () => {
  const src = fs.readFileSync("server/storage.ts", "utf8");
  const body = src.slice(src.indexOf("async createImprovedHtmlFile"), src.indexOf("async getImprovedHtmlFile"));
  assert.match(body, /pg_advisory_xact_lock/u, "a foglalás a tananyag azonosítójára zárol");
  assert.match(body, /improvedHtmlFiles\.status\} = 'processing'/u, "a zár alatt újraellenőrzi az aktív jobot");
  assert.match(body, /return null/u, "aktív jobnál nem szúr be újat");
});
