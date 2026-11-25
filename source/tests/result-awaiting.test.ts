import assert from "node:assert/strict";
import test from "node:test";
import { asAwaiting, createLatest, raceAwaiting } from "../shared/result-awaiting";

/** U4d (review #591): sorszámozott állapot-lekérdezés és a szerver időkorlátja. */

test("createLatest: a korábbi, később érkező válasz nem érvényes; kulcsonként független", () => {
  const l = createLatest();
  const a = l.next("l1"); const b = l.next("l1"); const c = l.next("l2");
  assert.equal(l.isLatest("l1", a), false, "a régebbi (pl. lassú) válasz elvész");
  assert.equal(l.isLatest("l1", b), true);
  assert.equal(l.isLatest("l2", c), true);
});

test("asAwaiting: csak tasks / quiz", () => {
  assert.equal(asAwaiting("tasks"), "tasks");
  assert.equal(asAwaiting("quiz"), "quiz");
  assert.equal(asAwaiting("valami"), null);
  assert.equal(asAwaiting(undefined), null);
});

test("raceAwaiting: érték, időtúllépés és hiba → null", async () => {
  assert.equal(await raceAwaiting(Promise.resolve("tasks"), 100), "tasks");
  assert.equal(await raceAwaiting(new Promise(r => setTimeout(() => r("quiz"), 300)), 20), null);
  assert.equal(await raceAwaiting(Promise.reject(new Error("x")), 100), null);
});
