import { test } from "node:test";
import assert from "node:assert/strict";
import { LEASE_GRACE_MS, NO_RUN_GRACE_MS, orphanedImproveIds, type ImproveOrphanRow } from "../server/improve-orphans";

/* Spec 2026-10-19-okositas-fazisjelzo (4): mért eset — a deploy újraindította a szervert, az okosítás rekordja 2 órán át `processing` maradt. */
const now = Date.parse("2026-10-19T11:00:00Z");
const row = (id: string, ageMs: number, runState: string | null, leaseOffsetMs: number | null): ImproveOrphanRow =>
  ({ id, createdAt: new Date(now - ageMs), runState, leaseUntil: leaseOffsetMs === null ? null : new Date(now + leaseOffsetMs) });

test("élő bérletű futás érintetlen; lejárt bérlet (újraindulás) lezárul", () => {
  assert.deepEqual(orphanedImproveIds([row("elo", 3_600_000, "running", 60_000)], now), []);
  assert.deepEqual(orphanedImproveIds([row("deploy-alatt", 3_600_000, "running", -LEASE_GRACE_MS + 5_000)], now), [], "a türelmi időn belül érintetlen");
  assert.deepEqual(orphanedImproveIds([row("arva", 7_179_000, "running", -600_000)], now), ["arva"]);
});

test("futásnapló nélkül: 5 perc után árva, előtte érintetlen; végállapotú futás lezárul", () => {
  assert.deepEqual(orphanedImproveIds([row("friss", NO_RUN_GRACE_MS - 1_000, null, null)], now), []);
  assert.deepEqual(orphanedImproveIds([row("regi", NO_RUN_GRACE_MS + 1_000, null, null)], now), ["regi"]);
  const ended = (id: string, state: string, updatedAgoMs: number): ImproveOrphanRow => ({ ...row(id, 3_600_000, state, null), runUpdatedAt: new Date(now - updatedAgoMs) });
  assert.deepEqual(orphanedImproveIds([ended("hibas-futas", "error", 600_000), ended("kesz", "done", 600_000)], now), ["hibas-futas", "kesz"]);
  assert.deepEqual(orphanedImproveIds([ended("epp-kesz", "ready", 20_000)], now), [], "épp elkészült jelölt: a rekordfrissítés előtt nem zárunk");
  assert.deepEqual(orphanedImproveIds([row("bérlet-nélkül-friss", 60_000, "running", null)], now), []);
});
