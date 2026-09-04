import assert from "node:assert/strict";
import test from "node:test";

import {
  groupNotesBySeverity,
  isPollingStatus,
  jobMonitorView,
  reorderSections,
  type ApiNote,
  type JobSummary,
} from "../shared/studio-ui";
import { coveragePercentages } from "../server/studio/step-io";
import type { OutlineCoverage } from "../server/studio/step-io";
import type { MapConcept } from "../server/studio/coverage";

/**
 * LS-2c — the pure layer behind the Studio client UI.
 *
 * The components themselves (JobMonitor, OutlineReview, LektorNotes) are React and are
 * covered by Playwright e2e once a real lesson exists; what can be pinned exactly, the
 * way the server layer already is, is the pure logic they read: the polling decision,
 * the Hungarian view mapping, the severity grouping (including the admin-only
 * book_probably_wrong split, D1), section reordering and the coverage percentages the
 * review bar shows.
 */

const MAP: MapConcept[] = [
  { localId: "c1", examWeight: "core" },
  { localId: "c2", examWeight: "core" },
  { localId: "s1", examWeight: "supporting" },
  { localId: "s2", examWeight: "supporting" },
  { localId: "s3", examWeight: "supporting" },
  { localId: "s4", examWeight: "supporting" },
  { localId: "s5", examWeight: "supporting" },
  { localId: "s6", examWeight: "supporting" },
  { localId: "s7", examWeight: "supporting" },
  { localId: "s8", examWeight: "supporting" },
];

function coverage(over: Partial<OutlineCoverage>): OutlineCoverage {
  return {
    ok: over.ok ?? false,
    missingCore: over.missingCore ?? [],
    unknownIds: over.unknownIds ?? [],
    supporting: over.supporting ?? { total: 8, covered: 8, ratio: 1 },
  };
}

/* ------------------------------------------------------------------ *
 * coveragePercentages — the review bar's numbers
 * ------------------------------------------------------------------ */

test("coveragePercentages: teljes fedettség → 100 / 100, ismeretlen 0", () => {
  const pct = coveragePercentages(coverage({ ok: true }), MAP);
  assert.deepEqual(pct, { core: 100, supporting: 100, unknown: 0 });
});

test("coveragePercentages: hiányzó kulcsfogalom és kiegészítő arányos", () => {
  const pct = coveragePercentages(
    coverage({
      missingCore: ["c2"],
      supporting: { total: 8, covered: 6, ratio: 0.75 },
    }),
    MAP,
  );
  assert.equal(pct.core, 50);
  assert.equal(pct.supporting, 75);
});

test("coveragePercentages: nincs kulcsfogalom a térképen → core 100 (nem 0/0)", () => {
  const onlySupporting: MapConcept[] = [{ localId: "s1", examWeight: "supporting" }];
  const pct = coveragePercentages(coverage({}), onlySupporting);
  assert.equal(pct.core, 100);
});

test("coveragePercentages: ismeretlen fogalom-azonosítók száma megjelenik", () => {
  const pct = coveragePercentages(coverage({ unknownIds: ["ghost1", "ghost2"] }), MAP);
  assert.equal(pct.unknown, 2);
});

/* ------------------------------------------------------------------ *
 * Polling decision — JobMonitor csak futó jobot kérdez 2 másodpercenként
 * ------------------------------------------------------------------ */

test("isPollingStatus: pending és running közben kérdez, ok/error alatt nem", () => {
  assert.equal(isPollingStatus("pending"), true);
  assert.equal(isPollingStatus("running"), true);
  assert.equal(isPollingStatus("ok"), false);
  assert.equal(isPollingStatus("error"), false);
});

/* ------------------------------------------------------------------ *
 * jobMonitorView — the Hungarian view model the monitor renders
 * ------------------------------------------------------------------ */

function job(over: Partial<JobSummary>): JobSummary {
  return { id: "j1", step: "pedagogue", status: "running", round: 0, error: null, ...over };
}

test("jobMonitorView: magyar lépés-címkék (pedagógus/szerző/lektor/kapu)", () => {
  assert.equal(jobMonitorView(job({ step: "pedagogue" })).stepLabel, "Pedagógus");
  assert.equal(jobMonitorView(job({ step: "author" })).stepLabel, "Szerző");
  assert.equal(jobMonitorView(job({ step: "lektor" })).stepLabel, "Lektor");
  assert.equal(jobMonitorView(job({ step: "gate" })).stepLabel, "Kapu");
  assert.equal(jobMonitorView(job({ step: "done" })).stepLabel, "Kész");
  assert.equal(jobMonitorView(job({ step: "error" })).stepLabel, "Hiba");
});

test("jobMonitorView: futó jobot tovább kérdezünk, kész jobot nem", () => {
  assert.equal(jobMonitorView(job({ status: "running" })).polling, true);
  assert.equal(jobMonitorView(job({ status: "pending" })).polling, true);
  assert.equal(jobMonitorView(job({ status: "ok", step: "author" })).polling, false);
});

test("jobMonitorView: szerző-lépésen várakozó job jóváhagyásra vár", () => {
  const view = jobMonitorView(job({ step: "author", status: "ok", round: 0 }));
  assert.equal(view.waitingApproval, true);
  assert.equal(view.statusLabel, "Várakozás jóváhagyásra");
});

test("jobMonitorView: jóváhagyott vázlattal futó szerző már nem vár jóváhagyásra", () => {
  const view = jobMonitorView(
    job({ step: "author", status: "running", round: 0 }),
    { approvedOutline: true },
  );
  assert.equal(view.waitingApproval, false);
});

test("jobMonitorView: hibaüzenet és végállapot átadódik", () => {
  const view = jobMonitorView(job({ step: "error", status: "error", error: "A vázlat alakilag hibás: x" }));
  assert.equal(view.finished, true);
  assert.equal(view.error, "A vázlat alakilag hibás: x");
  assert.equal(view.statusLabel, "Hiba");
});

test("jobMonitorView: kapunál parkoló job lezártnak számít", () => {
  const view = jobMonitorView(job({ step: "gate", status: "ok" }));
  assert.equal(view.finished, true);
  assert.equal(view.polling, false);
});

test("jobMonitorView: javítási kör felirat csak 1. körtől", () => {
  assert.equal(jobMonitorView(job({ round: 0 })).roundLabel, null);
  assert.equal(jobMonitorView(job({ round: 1 })).roundLabel, "1. javítási kör");
  assert.equal(jobMonitorView(job({ round: 2 })).roundLabel, "2. javítási kör");
});

/* ------------------------------------------------------------------ *
 * groupNotesBySeverity — three lists + the D1 admin-only split
 * ------------------------------------------------------------------ */

const NOTES: ApiNote[] = [
  { id: "n1", kind: "source_conflict", severity: "blocker", message: "ismeretlen fogalom", subkind: "not_in_map", blockPath: null, resolvedBy: null },
  { id: "n2", kind: "coverage_gap", severity: "warn", message: "kiegészítő hiányzik", subkind: "supporting", blockPath: null, resolvedBy: null },
  { id: "n3", kind: "source_conflict", severity: "info", message: "a könyv szerintem téved", subkind: "book_probably_wrong", blockPath: null, resolvedBy: null },
  { id: "n4", kind: "language", severity: "warn", message: "túl hosszú mondat", subkind: null, blockPath: null, resolvedBy: null },
];

test("groupNotesBySeverity: három lista súlyosság szerint", () => {
  const g = groupNotesBySeverity(NOTES);
  assert.equal(g.blocker.length, 1);
  assert.equal(g.warn.length, 2);
  assert.equal(g.info.length, 1);
});

test("groupNotesBySeverity: book_probably_wrong mindig az admin-jegyzetek közé kerül", () => {
  const g = groupNotesBySeverity(NOTES);
  assert.equal(g.adminOnly.length, 1);
  assert.equal(g.adminOnly[0].subkind, "book_probably_wrong");
});

test("groupNotesBySeverity: ismeretlen súlyosság eldobása (nem kerül egyik listába sem)", () => {
  const g = groupNotesBySeverity([
    ...NOTES,
    { id: "n5", kind: "language", severity: "catastrophic", message: "x", subkind: null, blockPath: null, resolvedBy: null },
  ]);
  const total = g.blocker.length + g.warn.length + g.info.length;
  assert.equal(total, 4);
});

test("groupNotesBySeverity: üres bemenet → három üres lista", () => {
  const g = groupNotesBySeverity([]);
  assert.deepEqual(g, { blocker: [], warn: [], info: [], adminOnly: [] });
});

/* ------------------------------------------------------------------ *
 * reorderSections — the @dnd-kit drag result, pure and clamped
 * ------------------------------------------------------------------ */

test("reorderSections: előre húzás a sorrendet cseréli, az eredeti tömb nem módosul", () => {
  const src = ["a", "b", "c"];
  const out = reorderSections(src, 0, 2);
  assert.deepEqual(out, ["b", "c", "a"]);
  assert.deepEqual(src, ["a", "b", "c"], "the source array must stay untouched");
});

test("reorderSections: hátra húzás", () => {
  assert.deepEqual(reorderSections(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
});

test("reorderSections: érvénytelen indexeken változatlan sorrend", () => {
  assert.deepEqual(reorderSections(["a", "b"], -1, 5), ["a", "b"]);
});
