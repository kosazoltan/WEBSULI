import assert from "node:assert/strict";
import test from "node:test";

// docs/specs/2026-11-16-tananyag-programozas-felirat.md (P4): e2e-módban nincs eseményalapú mentés, élesben változatlan.
process.env.DATABASE_URL ??= "postgresql://unit:unit@127.0.0.1:1/unit_never_connects";
const { triggerEventBackup, cancelPendingEventBackup } = await import("../server/autoBackup");

test("e2e-mód (WEBSULI_E2E=1): nincs mentés és nincs időzítő", () => {
  let calls = 0;
  const create = async () => { calls++; };
  for (let i = 0; i < 3; i++) assert.equal(triggerEventBackup({ env: { WEBSULI_E2E: "1" }, create }), "skipped-e2e");
  assert.equal(calls, 0);
  assert.equal(cancelPendingEventBackup(), false, "nem maradhat függő időzítő");
});

test("éles mód: az első esemény azonnal ment, a következő a debounce-időzítőre kerül; a leállító törli", async () => {
  let calls = 0;
  let release!: () => void;
  const done = new Promise<void>((resolve) => { release = resolve; });
  const create = async () => { calls++; release(); };
  assert.equal(triggerEventBackup({ env: {}, create }), "started");
  await done;
  await new Promise((resolve) => setImmediate(resolve)); // a .then() frissíti az utolsó mentés idejét
  assert.equal(calls, 1);
  assert.equal(triggerEventBackup({ env: {}, create }), "scheduled");
  assert.equal(cancelPendingEventBackup(), true);
  assert.equal(cancelPendingEventBackup(), false);
  assert.equal(calls, 1, "a törölt időzítő nem ment");
});
