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

test("crash-loop ellen: a végrehajtás-keret elfogyott → nincs folytatás, lezárás induláskor ÉS futás közben (review #191 spec-változás)", () => {
  assert.equal(sweepDecision(row({ executions: AUTO_RESUME_MAX_EXECUTIONS }), now, true), "close");
  assert.equal(sweepDecision(row({ executions: AUTO_RESUME_MAX_EXECUTIONS }), now, false), "close");
  assert.ok(AUTO_RESUME_MAX_EXECUTIONS < 4, "a 4-es kemény korlát alatt egy kézi próba marad");
});

test("nem folytatható (nincs futás / megállt / várakozik) → indításkor a régi lezárás (#183: nincs örök poll), futás közben érintetlen", () => {
  for (const d of [{ runId: null, owner: null, runState: null }, { runState: "waiting" }, { runState: "error" }] as Array<Partial<SweepRow>>) {
    assert.equal(sweepDecision(row(d), now, true), "close", JSON.stringify(d));
    assert.equal(sweepDecision(row(d), now, false), "leave", JSON.stringify(d));
  }
});

test("review #191: lejárt lízing + futó workflow + elfogyott keret → az időszakos söprés lezárja (nincs örök running); élő lízing mellett érintetlen", () => {
  for (const executions of [AUTO_RESUME_MAX_EXECUTIONS, AUTO_RESUME_MAX_EXECUTIONS + 5]) {
    assert.equal(sweepDecision(row({ executions }), now, false), "close", String(executions));
    assert.equal(sweepDecision(row({ executions, owner: null }), now, false), "close", "gazda nélkül is");
    assert.equal(sweepDecision(row({ executions, leaseUntil: new Date(now + 30_000) }), now, false), "leave", "élő lízing");
  }
  const routes = readFileSync(new URL("../server/studio/lesson-pipeline-routes.ts", import.meta.url), "utf8");
  // S4b (docs/specs/2026-10-16-egy-futas.md): a söprés minden nem-„leave” döntésnél lezár; a feltétel ugyanaz — a kész job nem íródik felül.
  assert.match(routes, /if \(sweepDecision\(row, now, boot\) === "leave"\) continue;[\s\S]*?await db\.update\(studioJobs\)[^\n]*\.where\(and\(eq\(studioJobs\.id, row\.id\), ne\(studioJobs\.status, "ok"\)\)\)/, "a lezárás nem írja felül a kész jobot");
});

test("lezárt job → mindig érintetlen", () => {
  for (const status of ["ok", "error"]) assert.equal(sweepDecision(row({ status }), now, true), "leave");
});

test("bekötés: induláskor és időszakosan fut; a lízing-ütközés nem zárja hibára a jobot; a régi vezérlő nem írja felül az újat", () => {
  const routes = readFileSync(new URL("../server/studio/lesson-pipeline-routes.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
  assert.match(index, /await closeOrphanedStudioJobs\(\);\s*\/\/[^\n]*\n\s*startStudioJobSweeper\(\);/);
  // S4b (docs/specs/2026-10-16-egy-futas.md): automatikus folytatás és követett régi gyártás nincs — a söprés csak lezár (a piszkozat megmarad, újragyártható).
  assert.doesNotMatch(routes, /driveTracked\(|Automatikus folytatás/);
});

test("mért hiba 2026-10-15 (térkép 3f39ab9b): a halott folyamat `interrupted` futása is folytatódik — induláskor és később is; élő lízingnél érintetlen", () => {
  assert.equal(sweepDecision(row({ runState: "interrupted" }), now, true), "resume", "induláskor nem zárul le");
  assert.equal(sweepDecision(row({ runState: "interrupted" }), now, false), "resume", "a régi példány lízingjének lejárta után a söprés folytatja (nincs örök running)");
  assert.equal(sweepDecision(row({ runState: "interrupted", leaseUntil: new Date(now + 30_000) }), now, false), "leave");
  assert.equal(sweepDecision(row({ runState: "interrupted", executions: AUTO_RESUME_MAX_EXECUTIONS }), now, false), "close", "a crash-loop korlát marad");
});
