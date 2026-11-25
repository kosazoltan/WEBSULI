import assert from "node:assert/strict";
import test from "node:test";

import { bankUnitQuota } from "../shared/lesson-bank-plan";
import { METHOD_KINDS } from "../shared/lesson-experience";
import { seedFrom } from "../shared/seeded";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (11. szakasz 4. pont; V8, V10): a módszerek sorrendje a magból keveredik.

const plan = (n: number) => ({ units: Array.from({ length: n }, (_, sectionIndex) => ({ sectionIndex, conceptIds: ["a", "b"] })), taskRound: 15, quizRound: 25 });
const kinds = (n: number, seed?: number) => plan(n).units.map((_, i) => bankUnitQuota(plan(n), i, seed).methodKinds);

test("V8: mag nélkül a kiosztás a régi (rögzített példák)", () => {
  assert.deepEqual(kinds(1), [["prediction", "gate", "myth", "sorting", "causeEffect", "conflict", "selfCheck", "popup", "timeline", "analogy", "gate"]]);
  assert.deepEqual(kinds(3), [["prediction", "sorting", "selfCheck", "analogy"], ["gate", "causeEffect", "popup", "gate"], ["myth", "conflict", "timeline"]]);
  assert.deepEqual(kinds(5), [["prediction", "conflict", "gate"], ["gate", "selfCheck"], ["myth", "popup"], ["sorting", "timeline"], ["causeEffect", "analogy"]]);
  assert.deepEqual(kinds(3, undefined), kinds(3));
});

test("V10: maggal mind a tíz fajta és két kapukérdés megmarad, csomagonként ≥ 2 fajta; az első módszer ≥ 6-féle", () => {
  const first = new Set<string>();
  for (let s = 0; s < 50; s++) {
    const seed = seedFrom(`map-${s}`);
    for (const n of [1, 2, 3, 5, 8]) {
      const all = kinds(n, seed);
      const flat = all.flat();
      for (const k of METHOD_KINDS) assert.ok(flat.includes(k), `${n}/${s}: hiányzik ${k}`);
      assert.ok(flat.filter((k) => k === "gate").length >= 2, `${n}/${s}: kevés kapukérdés`);
      for (const list of all) assert.ok(new Set(list).size >= 2, `${n}/${s}: egyfajtás csomag`);
      assert.deepEqual(all, kinds(n, seed), "determinisztikus");
    }
    first.add(kinds(3, seed)[0][0]);
  }
  assert.ok(first.size >= 6, `az első módszer csak ${first.size}-féle`);
});

test("S5b vak kör 1 L4: maggal PONTOSAN két kapukérdés — a csomagkitöltő nem ad harmadikat (1–12 csomag, 50 mag)", () => {
  for (let s = 0; s < 50; s++) {
    const seed = seedFrom(`map-${s}`);
    for (let n = 1; n <= 12; n++) {
      const gates = kinds(n, seed).flat().filter((k) => k === "gate").length;
      assert.equal(gates, 2, `${n} csomag, map-${s}: ${gates} kapukérdés`);
    }
  }
  // Mag nélkül (KI) a régi kiosztás marad — ott a kitöltő viselkedése változatlan.
  assert.deepEqual(kinds(10), kinds(10, undefined));
});

test("review #534 (Copilot): a kész csomag módszerei a kiosztott sorrendbe rendeződnek; a kapuk száma BE állapotban pontos", async () => {
  const { orderMethodsByQuota, gateCountProblem } = await import("../shared/lesson-bank-plan");
  const m = (kind: string, id: string) => ({ kind, id });
  const quota = ["gate", "causeEffect", "popup", "gate"];
  const model = [m("causeEffect", "a"), m("gate", "g1"), m("popup", "p"), m("gate", "g2")];
  assert.deepEqual(orderMethodsByQuota(model, quota).map((x) => x.id), ["g1", "a", "p", "g2"], "a kvóta sorrendje, a fajtán belül az eredeti sorrend");
  assert.deepEqual(orderMethodsByQuota([...model, m("myth", "extra")], quota).map((x) => x.id), ["g1", "a", "p", "g2", "extra"], "a kvótán kívüli tétel a végére");
  assert.deepEqual(orderMethodsByQuota(model, undefined), model, "kiosztás nélkül (KI) változatlan");
  assert.equal(gateCountProblem(model, quota), null);
  assert.match(gateCountProblem([...model, m("gate", "g3")], quota) ?? "", /kapukérdés/u, "harmadik kapu BE állapotban hiba");
  assert.equal(gateCountProblem([...model, m("gate", "g3")], undefined), null, "KI: a régi (legalább) szabály, itt nincs felső korlát");
});
