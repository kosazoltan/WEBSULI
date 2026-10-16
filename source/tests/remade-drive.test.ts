import test from "node:test";
import assert from "node:assert/strict";
import { driveRemadeWith, type RemadeDeps } from "../server/studio/remade-drive";
import { WorkflowWaiting } from "../server/workflows/engine";

/* docs/specs/2026-10-16-ujragyartas-jovahagyas.md (J1) + review #256 (P1): a valódi `driveTracked` a terv-várakozást ELNYELI és normálisan
   tér vissza. A hamis `drive` ugyanígy viselkedik — a jóváhagyásnak ettől függetlenül le kell futnia. */

function fake(opts: { approvals?: Array<"approved" | "retry" | "failed">; waitsAfterApproval?: number; throwsWaiting?: boolean }) {
  const log: string[] = [];
  let waiting = false;
  let approvalsLeft = [...(opts.approvals ?? ["approved"])];
  let extraWaits = opts.waitsAfterApproval ?? 0;
  const deps: RemadeDeps = {
    maxRounds: 6,
    drive: async (start, beforeDrive) => {
      log.push(start ? "drive:start" : "drive:continue");
      if (beforeDrive) {
        try { await beforeDrive(); } catch (e) { if (e instanceof WorkflowWaiting) { log.push("waiting(swallowed)"); return; } throw e; }
        if (!waiting) return;
        waiting = false;
        if (extraWaits > 0) { extraWaits--; waiting = true; log.push("author→plan-again"); return; }
        log.push("author+rest");
        return;
      }
      // Első kör: a pedagógus megírja a tervet, a futás a jóváhagyásra vár — a valódi driveTracked ezt ELNYELI.
      waiting = true;
      log.push("plan-ready");
      if (opts.throwsWaiting) throw new WorkflowWaiting("A tanulási terv jóváhagyására vár.", true);
    },
    awaitingApproval: async () => waiting,
    approve: async () => {
      const outcome = approvalsLeft.shift() ?? "approved";
      log.push(`approve:${outcome}`);
      if (outcome === "retry") waiting = true; // a javító kör után újra tervre vár
      return { outcome, reason: outcome === "failed" ? "nem menthető" : "" };
    },
  };
  return { deps, log };
}

test("review #256: elnyelt várakozás után is jóváhagy és végigmegy (a mért author/ok-elakadás nem ismétlődik)", async () => {
  const { deps, log } = fake({});
  assert.equal(await driveRemadeWith(deps), "done");
  assert.deepEqual(log, ["drive:start", "plan-ready", "drive:continue", "approve:approved", "author+rest"]);
});

test("ha a drive dobja a várakozást, ugyanúgy végigmegy", async () => {
  const { deps, log } = fake({ throwsWaiting: true });
  assert.equal(await driveRemadeWith(deps), "done");
  assert.ok(log.includes("approve:approved") && log.includes("author+rest"));
});

test("fedettségi javító kör után újra jóváhagy, majd végigmegy", async () => {
  const { deps, log } = fake({ approvals: ["retry", "approved"], waitsAfterApproval: 1 });
  assert.equal(await driveRemadeWith(deps), "done");
  assert.equal(log.filter((l) => l.startsWith("approve:")).length, 2);
});

test("sikertelen jóváhagyásnál megáll (nem pörög a lépés-határig)", async () => {
  const { deps, log } = fake({ approvals: ["failed"] });
  assert.equal(await driveRemadeWith(deps), "approval-failed");
  assert.equal(log.filter((l) => l.startsWith("approve:")).length, 1);
});

test("ha nem a terv-jóváhagyásra vár (kész / más döntés), nem hagy jóvá", async () => {
  const deps: RemadeDeps = { maxRounds: 6, drive: async () => {}, awaitingApproval: async () => false, approve: async () => { throw new Error("nem hívható"); } };
  assert.equal(await driveRemadeWith(deps), "done");
});

test("folytatás a már tervre váró jobnál (start=false): első körben jóváhagy", async () => {
  const { deps, log } = fake({});
  // A job már tervre vár (a deploy előtti elakadt újragyártás).
  await deps.drive(true);
  log.length = 0;
  assert.equal(await driveRemadeWith(deps, false), "done");
  assert.deepEqual(log, ["drive:continue", "approve:approved", "author+rest"]);
});
