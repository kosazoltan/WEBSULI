import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUTO_RESUME_MAX_EXECUTIONS, sweepDecision, type SweepRow } from "../server/studio/orphan-jobs";

/* Spec 2026-10-05-s10-adatvesztes-mentesseg (2. szelet) — automatikus folytatás szerver-újraindulás után, a független
   terv-ellenőrzés javításaival (deploykori élő lízing, crash-loop korlát, a régi vezérlő nem írja felül az újat). */

const now = Date.parse("2026-10-05T12:00:00Z");
const row = (d: Partial<SweepRow>): SweepRow => ({ id: "j", status: "running", runId: "r", owner: "u", runState: "running", leaseUntil: new Date(now - 1_000), executions: 1, ...d });

test("lejárt lízing + futó workflow + van keret → folytatás (indításkor és időszakosan is)", () => {
  assert.equal(sweepDecision(row({}), now, true), "resume");
  assert.equal(sweepDecision(row({}), now, false), "resume");
  assert.equal(sweepDecision(row({ leaseUntil: null }), now, true), "resume");
});

test("élő lízing (deploykor a régi példány, vagy helyi próba ugyanazon a DB-n) → érintetlen", () => {
  assert.equal(sweepDecision(row({ leaseUntil: new Date(now + 30_000) }), now, true), "leave");
  assert.equal(sweepDecision(row({ leaseUntil: new Date(now + 30_000) }), now, false), "leave");
});

test("crash-loop ellen: a végrehajtás-keret elfogyott → nincs folytatás (indításkor a régi lezárás, futás közben érintetlen)", () => {
  assert.equal(sweepDecision(row({ executions: AUTO_RESUME_MAX_EXECUTIONS }), now, true), "close");
  assert.equal(sweepDecision(row({ executions: AUTO_RESUME_MAX_EXECUTIONS }), now, false), "leave");
  assert.ok(AUTO_RESUME_MAX_EXECUTIONS < 4, "a 4-es kemény korlát alatt egy kézi próba marad");
});

test("nem folytatható (nincs futás / megállt / várakozik) → indításkor a régi lezárás (#183: nincs örök poll), futás közben érintetlen", () => {
  for (const d of [{ runId: null, owner: null, runState: null }, { runState: "waiting" }, { runState: "error" }] as Array<Partial<SweepRow>>) {
    assert.equal(sweepDecision(row(d), now, true), "close", JSON.stringify(d));
    assert.equal(sweepDecision(row(d), now, false), "leave", JSON.stringify(d));
  }
});

test("lezárt job → mindig érintetlen", () => {
  for (const status of ["ok", "error"]) assert.equal(sweepDecision(row({ status }), now, true), "leave");
});

test("bekötés: induláskor és időszakosan fut; a lízing-ütközés nem zárja hibára a jobot; a régi vezérlő nem írja felül az újat", () => {
  const routes = readFileSync(new URL("../server/studio/lesson-pipeline-routes.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
  assert.match(index, /await closeOrphanedStudioJobs\(\);\s*\/\/[^\n]*\n\s*startStudioJobSweeper\(\);/);
  assert.match(routes, /if \(error instanceof WorkflowConflict\) \{ logger\.warn\(`\[STUDIO\] Automatikus folytatás kihagyva/);
  assert.match(routes, /if \(error instanceof WorkflowConflict\) \{ logger\.warn\(`\[STUDIO\] Követett készítés átadva/);
});
