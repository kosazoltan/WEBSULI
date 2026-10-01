import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_AUTHOR_ROUNDS, MAX_BANK_ONLY_ROUNDS, MAX_CHAIN_STEPS, REPAIR_CHAIN_STEPS, REPAIR_KINDS } from "../server/studio/pipeline";
import { canSpendRepair, ensureRepairPath, repairPathAvailable, repairPathOpen, repairRemaining, repairSpentForRound, repairUse, spendRepair, type RepairBudget } from "../server/studio/repair-ledger";

/* Spec 2026-10-01-javitasi-fokonyv: a körlimit-javítások egyetlen főkönyve — egy tábla, egy olvasó, egy író, egy keret-döntés. */

const budget = (visits: Record<string, number>, grant: boolean) => {
  const calls: string[] = [];
  const b: RepairBudget = {
    visitsLeft: (s) => visits[s] ?? 0,
    ensure: async (reason) => { calls.push(reason); if (!grant) return false; for (const k of Object.keys(visits)) if (visits[k] <= 0) visits[k] = 1; return true; },
  };
  return { b, calls };
};
const full = () => ({ author: 1, animator: 1, lektor: 1, gate: 1 });

test("a lánc-korlát a javítás-táblából számolódik, értéke változatlan (35)", () => {
  assert.equal(REPAIR_CHAIN_STEPS, Object.values(REPAIR_KINDS).reduce((n, k) => n + k.limit * k.steps.length, 0));
  assert.equal(MAX_CHAIN_STEPS, 1 + (MAX_AUTHOR_ROUNDS + 1) * 4 + REPAIR_CHAIN_STEPS + 1);
  assert.equal(MAX_CHAIN_STEPS, 35, "a refaktor előtti kézi képlet értéke");
  assert.equal(MAX_BANK_ONLY_ROUNDS, 2);
});

test("régi mezők: a főkönyv ugyanazt a felhasználást látja (folytatott jobok)", () => {
  const legacy = { bankOnlyRepairRounds: 2, bankOnlyRepairRound: 4, targetedGateRepairRound: 3, targetedLektorRepairRound: 5, instructionRepairRound: 6, gateBankRepairUsed: true };
  assert.deepEqual(repairUse(legacy, "bankOnly"), { used: 2, rounds: [4] });
  assert.equal(repairRemaining(legacy, "bankOnly"), 0);
  assert.equal(repairSpentForRound(legacy, "targetedGate", 3), true);
  assert.equal(repairRemaining(legacy, "targetedLektor"), 0);
  assert.equal(repairRemaining(legacy, "instruction"), 0);
  assert.equal(repairRemaining(legacy, "gateBank"), 0);
  assert.deepEqual(repairUse({ bankOnlyRepairRound: 3 }, "bankOnly"), { used: 1, rounds: [3] }, "a legrégebbi egyszeres jelző");
  assert.equal(repairRemaining({}, "targetedGate"), 1);
});

test("spendRepair: az egyetlen író — főkönyv + régi tükör, a többi mező érintetlen", () => {
  let out: Record<string, unknown> = { gate: { ok: false } };
  out = spendRepair(out, "bankOnly", 3);
  out = spendRepair(out, "bankOnly", 4);
  assert.deepEqual(repairUse(out, "bankOnly"), { used: 2, rounds: [3, 4] });
  assert.equal(out.bankOnlyRepairRounds, 2);
  assert.equal(out.bankOnlyRepairRound, 4);
  assert.deepEqual(out.gate, { ok: false });
  out = spendRepair(out, "targetedGate", 5);
  assert.equal(out.targetedGateRepairRound, 5);
  assert.equal(repairSpentForRound(out, "targetedGate", 5), true);
  out = spendRepair(out, "gateBank", 5);
  assert.equal(out.gateBankRepairUsed, true);
  assert.equal(repairRemaining(out, "gateBank"), 0);
});

test("canSpendRepair: limit, teljes javítóút-látogatás, dinamikus keret csak az arra jogosult fajtánál", async () => {
  // limit elfogyott → nem, keret-kérés sincs
  const a = budget(full(), true);
  assert.equal(await canSpendRepair({ targetedGateRepairRound: 3 }, "targetedGate", "x", a.b), false);
  assert.deepEqual(a.calls, []);
  // van limit és minden lépésre van látogatás → igen, keret-kérés nélkül
  const c = budget(full(), true);
  assert.equal(await canSpendRepair({}, "bankOnly", "x", c.b), true);
  assert.deepEqual(c.calls, []);
  // a csak-bank kör a KAPU-látogatást is nézi (a kör a kapuig fut), és dinamikus keretet nem kér
  const d = budget({ author: 1, animator: 1, lektor: 1, gate: 0 }, true);
  assert.equal(await canSpendRepair({}, "bankOnly", "x", d.b), false);
  assert.deepEqual(d.calls, []);
  // dinamikus keretes fajta: elfogyott látogatásnál többletkeretet kér
  const e = budget({ author: 0, animator: 1, lektor: 1, gate: 1 }, true);
  assert.equal(await canSpendRepair({}, "targetedGate", "kapu", e.b), true);
  assert.deepEqual(e.calls, ["kapu"]);
  // a többletkeret elfogyott → nem
  const f = budget({ author: 0, animator: 1, lektor: 1, gate: 1 }, false);
  assert.equal(await canSpendRepair({}, "targetedLektor", "lektor", f.b), false);
});

test("ensureRepairPath: a limit előtti szerzői javítókör kerete (látogatás vagy dinamikus keret)", async () => {
  assert.equal(await ensureRepairPath("x", budget(full(), false).b), true);
  assert.equal(await ensureRepairPath("x", budget({ author: 0, animator: 1, lektor: 1, gate: 1 }, false).b), false);
  assert.equal(await ensureRepairPath("x", budget({ author: 0, animator: 1, lektor: 1, gate: 1 }, true).b), true);
});

test("forrás-ellenőrzés: a lépésfuttató a régi javítás-jelzőket nem olvassa/írja közvetlenül (csak a főkönyv)", () => {
  const src = readFileSync(new URL("../server/studio/step-runner.ts", import.meta.url), "utf8");
  for (const field of ["bankOnlyRepairRounds", "bankOnlyRepairRound", "targetedGateRepairRound", "targetedLektorRepairRound", "instructionRepairRound", "gateBankRepairUsed"]) {
    assert.equal(new RegExp(`output\\??\\.${field}\\b|\\b${field}:`).test(src), false, `${field} közvetlen használata a step-runnerben`);
  }
  assert.equal(/\bMAX_BANK_ONLY_ROUNDS\b(?!\s*csak-bank)/.test(src.replace(/\/\/.*$/gm, "")), false, "a csak-bank limitet a főkönyv táblája adja");
  // review #179: a javítóút keretét sem méri helyben (sem látogatás, sem dinamikus keret) — csak a főkönyv
  for (const fn of ["workflowStepVisitsLeft", "workflowRepairBudgetAvailable", "workflowEnsureRepairBudget"]) {
    assert.equal(src.includes(fn), false, `${fn} közvetlen használata a step-runnerben`);
  }
});

test("review #179: repairPathOpen / repairPathAvailable — fogyasztás nélküli elérhetőség a főkönyvben", () => {
  const open: RepairBudget = { visitsLeft: () => 1, ensure: async () => true, grantsLeft: () => false };
  const closedNoGrant: RepairBudget = { visitsLeft: (s) => (s === "author" ? 0 : 1), ensure: async () => true, grantsLeft: () => false };
  const closedGrant: RepairBudget = { ...closedNoGrant, grantsLeft: () => true };
  assert.equal(repairPathOpen(open), true);
  assert.equal(repairPathOpen(closedNoGrant), false);
  assert.equal(repairPathAvailable(closedNoGrant), false);
  assert.equal(repairPathAvailable(closedGrant), true, "a még igényelhető többletkeret elérhetővé teszi");
});
