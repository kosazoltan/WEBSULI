import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyQuizItem, classifyOpenTask } from "../shared/practice-policy";

// META-TÉVES-JELÖLÉS (élő leltár, 2026-11-27): a tananyagra kérdező tétel nem meta.
test("a tudományra és a biológiai fajra kérdező tétel nem meta", () => {
  const science = classifyQuizItem({ question: "Egy előkerült emberi csontváz alapján azt vizsgálják, milyen volt az illető testfelépítése. Melyik tudomány dolgozik ezen?", options: ["embertan (antropológia)", "régészet", "nyelvészet"] });
  assert.notEqual(science.kind, "meta", science.reason);
  const species = classifyOpenTask({ q: "Mondd el szóban, milyen közös táplálkozási és sejtfelépítési tulajdonsága van mind az öt vizsgált fajnak!" });
  assert.notEqual(species.kind, "meta", species.reason);
});

test("a feladatlap feladattípusára és pontszámára kérdező tétel meta marad", () => {
  assert.equal(classifyQuizItem({ question: "Melyik feladattípus szerepel a felvételi kérdéssorában?", options: ["szótagolás", "betűrend", "mindkettő"] }).kind, "meta");
  assert.equal(classifyQuizItem({ question: "Hány pontot ér a felvételi 2. feladata?", options: ["2 pont", "4 pont", "5 pont"] }).kind, "meta");
});
