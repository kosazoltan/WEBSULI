import assert from "node:assert/strict";
import test from "node:test";
import { createAwaitingStore, raceAwaiting } from "../shared/result-awaiting";

/** U4d (docs/specs/2026-11-24-osszevont-eredmenylevel-vegrehajtas.md, 4. pont): a kliens „várakozó rész” tára és a szerver időkorlátja. */

const memoryStorage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };

test("tár: beállítás, olvasás, törlés; másik lecke független", () => {
  const store = createAwaitingStore(() => memoryStorage());
  assert.equal(store.get("l1"), null);
  store.set("l1", "tasks");
  assert.equal(store.get("l1"), "tasks");
  assert.equal(store.get("l2"), null, "másik lecke független");
  store.set("l2", "quiz");
  store.clear("l1");
  assert.equal(store.get("l1"), null);
  assert.equal(store.get("l2"), "quiz");
});

test("tár: írhatatlan tárolónál memóriában működik; érvénytelen érték nem jön vissza", () => {
  const broken = { getItem: () => { throw new Error("tiltva"); }, setItem: () => { throw new Error("tiltva"); }, removeItem: () => { throw new Error("tiltva"); } };
  const store = createAwaitingStore(() => broken);
  store.set("l1", "quiz");
  assert.equal(store.get("l1"), "quiz");
  const s2 = memoryStorage(); s2.setItem("websuli:result-awaiting:l9", "valami");
  assert.equal(createAwaitingStore(() => s2).get("l9"), null);
});

test("tár: feliratkozó értesül a változásról", () => {
  const store = createAwaitingStore(() => memoryStorage());
  const seen: Array<string | null> = [];
  const off = store.subscribe("l1", v => seen.push(v));
  store.set("l1", "tasks"); store.clear("l1"); off(); store.set("l1", "quiz");
  assert.deepEqual(seen, ["tasks", null]);
});

test("raceAwaiting: érték, időtúllépés és hiba → null", async () => {
  assert.equal(await raceAwaiting(Promise.resolve("tasks"), 100), "tasks");
  assert.equal(await raceAwaiting(new Promise(r => setTimeout(() => r("quiz"), 300)), 20), null);
  assert.equal(await raceAwaiting(Promise.reject(new Error("x")), 100), null);
});
