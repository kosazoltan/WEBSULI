import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { startupBackupDisabled } from "../server/lib/backup-startup";

/* Spec 2026-10-19-eroforras-s2b — mért: a Renderen minden indulás teljes exportot olvasott; a futás→job keresés pillanatképet bontott. */

test("induló mentés: a Renderen kimarad, máshol marad", () => {
  assert.equal(startupBackupDisabled({ RENDER: "true" }), true);
  assert.equal(startupBackupDisabled({}), false);
  assert.equal(startupBackupDisabled({ RENDER: "" }), false);
  assert.match(fs.readFileSync("server/autoBackup.ts", "utf8"), /if \(startupBackupDisabled\(\)\)/);
});

test("futás→job keresés: a szerverkód a generált resource_id oszlopot használja, a migráció létrehozza és indexeli", () => {
  for (const file of ["server/studio/lesson-pipeline-routes.ts", "server/workflows/store.ts"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /snapshot->>'resourceId'/, file);
  }
  const migration = fs.readFileSync("migrations/0036_workflow_resource_id.sql", "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS resource_id varchar GENERATED ALWAYS AS \(snapshot->>'resourceId'\) STORED/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS lesson_workflow_resource_id ON lesson_workflow_runs\(resource_id\)/);
});
