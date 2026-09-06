import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { markOrphanedJobs, ORPHAN_JOB_ERROR } from "../server/studio/orphan-jobs";
import { jobMonitorView } from "../shared/studio-ui";

/**
 * #183 — measured live (2026-09-06, incognito /admin?tab=lesson-studio):
 * studio_jobs row f4462d63 was step=gate / status=running / finished_at=null for
 * TEN HOURS. The driving process had died long before; nothing closes such a row,
 * so jobMonitorView() reported polling=true and the JobMonitor hammered
 * GET /api/studio/jobs/:id every 2s forever.
 *
 * #168 shipped exactly this sweep for `one_step_runs` — but only for that table.
 * These tests pin the same guarantee for `studio_jobs`.
 */

test("markOrphanedJobs: a nem-lezárt státuszú jobok árvák, a lezártak nem (#183)", () => {
  const rows = [
    { id: "j1", status: "running" },
    { id: "j2", status: "ok" },
    { id: "j3", status: "pending" },
    { id: "j4", status: "error" },
  ];
  const orphans = markOrphanedJobs(rows);
  assert.deepEqual(
    orphans.map((o) => o.id),
    ["j1", "j3"],
    "csak a running/pending sorokat söpörjük",
  );
  assert.equal(orphans[0].error, ORPHAN_JOB_ERROR);
  assert.match(orphans[0].error, /újraindult/, "a hibaüzenet megmondja az okot");
});

test("markOrphanedJobs: üres lista és csupa-lezárt lista nem söpör semmit (#183)", () => {
  assert.deepEqual(markOrphanedJobs([]), []);
  assert.deepEqual(markOrphanedJobs([{ id: "a", status: "ok" }, { id: "b", status: "error" }]), []);
});

test("a végtelen poll oka: a beragadt 'running' job pollingot kér (#183)", () => {
  const stuck = { id: "j", step: "gate", status: "running", round: 0, error: null };
  assert.equal(jobMonitorView(stuck).polling, true, "ez hajtotta a 2mp-es örök pollt");

  // A söprés utáni állapot ugyanazon a nézeten már NEM kér pollingot.
  const swept = { ...stuck, step: "error", status: "error", error: ORPHAN_JOB_ERROR };
  assert.equal(jobMonitorView(swept).polling, false, "söprés után a poll leáll");
  assert.equal(jobMonitorView(swept).finished, true);
});

test("a boot-sweep be van kötve a szerver indulásába (#183)", () => {
  const index = readFileSync(join(import.meta.dirname, "..", "server", "index.ts"), "utf8");
  // Szövegre grepelni hazug kapu: a kikommentezett hívás is illeszkedne rá
  // (mérve — az m3 mutáció túlélte). Ezért a kommenteket előbb kivágjuk, és
  // valódi, `await`-elt HÍVÁST követelünk, nem puszta említést.
  const code = index
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  assert.match(
    code,
    /await\s+closeOrphanedStudioJobs\s*\(\s*\)/,
    "index.ts induláskor MEGHÍVJA a studio_jobs söprést (nem csak importálja)",
  );
  assert.match(
    code,
    /await\s+closeOrphanedOneStepRuns\s*\(\s*\)/,
    "a #168-as söprés hívása is megmarad",
  );
});

test("a bekötés-ellenőrző kapu kiszúrja a kikommentezett hívást (#183)", () => {
  // A kapu önellenőrzése: ugyanaz a komment-vágó logika egy hamis forráson.
  const commentedOut = 'const x = 1;\n// await closeOrphanedStudioJobs();\n';
  const stripped = commentedOut
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  assert.doesNotMatch(
    stripped,
    /await\s+closeOrphanedStudioJobs\s*\(\s*\)/,
    "a kikommentezett hívás NEM számít bekötésnek",
  );
});
