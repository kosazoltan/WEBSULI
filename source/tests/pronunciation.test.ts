import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSpoken, pronunciationVerdict } from "../shared/pronunciation";

/* Spec 2026-10-21-nyelvlecke-kiejtes: a kiejtésgyakorlás összevetése. */

test("kiejtés: a kis-/nagybetű, az írásjel és a szóköz nem számít; az egyező kiejtés ✅", () => {
  assert.equal(normalizeSpoken("  This is a Triangle! "), "this is a triangle");
  assert.equal(pronunciationVerdict("This is a triangle.", "this is a triangle").state, "ok");
  assert.equal(pronunciationVerdict("I'm fine", "I’m fine").state, "ok", "a tipográfiai aposztróf is egyezik");
  assert.equal(pronunciationVerdict("Bonjour", "bonjour").state, "ok");
});

test("kiejtés: a közeli felismerés 🟡, a más szó 🔁, az üres 🔁", () => {
  assert.equal(pronunciationVerdict("This is a triangle.", "this is the triangle").state, "close");
  assert.equal(pronunciationVerdict("triangle", "rectangle").state, "retry");
  assert.equal(pronunciationVerdict("triangle", "").state, "retry");
  // Az ékezet számít (franciában más szó lehet): „été” ≠ „ete” — legfeljebb közeli.
  assert.notEqual(pronunciationVerdict("été", "ete").state, "ok");
});
