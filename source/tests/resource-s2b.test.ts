import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runStartupBackup, startupBackupDisabled } from "../server/lib/backup-startup";

/* Spec 2026-10-19-eroforras-s2b — mért: a Renderen minden indulás teljes exportot olvasott; a futás→job keresés pillanatképet bontott. */

test("induló mentés: a Renderen kimarad, máshol marad", () => {
  assert.equal(startupBackupDisabled({ RENDER: "true" }), true);
  assert.equal(startupBackupDisabled({}), false);
  assert.equal(startupBackupDisabled({ RENDER: "" }), false);
});

// Review #328: viselkedésszinten — a Renderen sem listázás, sem export nem fut; máshol a 24 órás őr és a biztonságos alapérték marad.
test("induló mentés futtatása: Render → nincs lista, nincs export; friss mentésnél kimarad; különben (hibás listánál is) mentés", async () => {
  const calls: string[] = [];
  const deps = (env: Record<string, string | undefined>, list: () => Promise<{ name: string; mtimeMs: number }[]>) => ({
    env, now: 1_000_000_000, listBackups: async () => { calls.push("list"); return list(); }, create: async () => { calls.push("create"); },
  });
  assert.equal(await runStartupBackup(deps({ RENDER: "true" }, async () => [])), "disabled");
  assert.deepEqual(calls, []);
  assert.equal(await runStartupBackup(deps({}, async () => [{ name: "backup_x.json", mtimeMs: 1_000_000_000 - 60_000 }])), "recent");
  assert.deepEqual(calls, ["list"]);
  calls.length = 0;
  assert.equal(await runStartupBackup(deps({}, async () => { throw new Error("EACCES"); })), "created");
  assert.deepEqual(calls, ["list", "create"]);
  assert.match(fs.readFileSync("server/autoBackup.ts", "utf8"), /void runStartupBackup\(\{/);
});

test("futás→job keresés: a szerverkód a generált resource_id oszlopot használja, a migráció létrehozza és indexeli", () => {
  for (const file of ["server/studio/lesson-pipeline-routes.ts", "server/workflows/store.ts"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /snapshot->>'resourceId'/, file);
  }
  const migration = fs.readFileSync("migrations/0036_workflow_resource_id.sql", "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS resource_id varchar GENERATED ALWAYS AS \(snapshot->>'resourceId'\) STORED/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS lesson_workflow_resource_id ON lesson_workflow_runs\(resource_id\)/);
  // Review #328: korlátos zárvárakozás — ütköző hosszú tranzakciónál a build gyorsan bukik (a régi példány fut tovább), nem akad el.
  assert.match(migration, /^SET LOCAL lock_timeout = '5s';/m);
});
