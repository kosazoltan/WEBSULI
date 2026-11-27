import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyQuizItem, classifyOpenTask, practiceQuota, practiceRatioRepairIssues } from "../shared/practice-policy";

// P7C-ARANYJAVITAS (docs/specs/2026-11-27-p7c-aranyjavitas.md): kvóta alatti régi csomag célzott arányjavítása.
const recall = (id: string, c: string) => ({ id, question: `Mit jelent a(z) ${c} fogalma?`, options: ["a", "b", "c", "d"], coversConceptIds: [c] });
const apply = (id: string, c: string) => ({ id, question: `Melyik mondatban helyes a(z) ${c} használata: „A kutya ugat.”?`, options: ["a", "b", "c", "d"], coversConceptIds: [c] });

test("a fixtúra tételei a várt osztályba esnek", () => {
  assert.equal(classifyQuizItem(recall("q", "x")).kind, "fogalmi");
  assert.equal(classifyQuizItem(apply("q", "x")).kind, "alkalmazas");
});

test("kvóta alatti kvíz: pontosan goal − alkalmazás fogalmi tétel kap cserejogot, fogalmanként egy felidéző marad", () => {
  const quiz = [...Array.from({ length: 8 }, (_, i) => recall(`r${i}`, i % 2 ? "c1" : "c2")), apply("a0", "c1"), apply("a1", "c2")];
  const goal = practiceQuota(quiz.length, 2, 0).quiz.goal;
  const issues = practiceRatioRepairIssues({ quiz, tasks: [] }, ["c1", "c2"]);
  assert.equal(issues.length, goal - 2);
  const ids = issues.map((s) => s.split(":")[0]);
  assert.ok(ids.every((id) => id.startsWith("r")), "csak fogalmi tétel");
  for (const c of ["c1", "c2"]) assert.ok(quiz.some((q) => q.id.startsWith("r") && q.coversConceptIds[0] === c && !ids.includes(q.id)), `marad felidéző: ${c}`);
});

test("kvótán belül vagy felett nincs cserejog", () => {
  const quiz = [recall("r0", "c1"), recall("r1", "c2"), ...Array.from({ length: 6 }, (_, i) => apply(`a${i}`, i % 2 ? "c1" : "c2"))];
  assert.deepEqual(practiceRatioRepairIssues({ quiz, tasks: [] }, ["c1", "c2"]), []);
});

test("nyílt feladatnál is: kvóta alatt fogalmi feladat kap cserejogot", () => {
  const tasks = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, q: "Magyarázd el, mit jelent a fogalom!", coversConceptIds: ["c1"] }));
  assert.ok(tasks.every((t) => classifyOpenTask(t).kind !== "alkalmazas"));
  const issues = practiceRatioRepairIssues({ quiz: [], tasks }, ["c1"]);
  assert.ok(issues.length > 0 && issues.every((s) => /^t\d: /.test(s)));
});

test("review #649: fogalmanként a recall címkéjű tétel is marad", () => {
  const quiz = [{ ...recall("r0", "c1"), intent: "recall" }, ...Array.from({ length: 9 }, (_, i) => ({ ...recall(`r${i + 1}`, "c1"), intent: "apply" }))];
  const ids = practiceRatioRepairIssues({ quiz, tasks: [] }, ["c1"]).map((s) => s.split(":")[0]);
  assert.ok(ids.length > 0);
  assert.ok(!ids.includes("r0"), "az egyetlen recall-címkés tétel nem cserélődik");
});

test("review #649: a meta-tétel előre alkalmazásnak számít (a meta-csere gyakorlatira cserél) — nincs kvóta-túllépés", () => {
  const meta = (id: string) => ({ id, question: "Hány pontot ér a feladatlapon a 3. feladat?", options: ["1", "2", "3", "4"], coversConceptIds: ["c1"] });
  const quiz = [...Array.from({ length: 6 }, (_, i) => meta(`m${i}`)), ...Array.from({ length: 4 }, (_, i) => recall(`r${i}`, i % 2 ? "c1" : "c2"))];
  assert.equal(classifyQuizItem(quiz[0]).kind, "meta");
  assert.deepEqual(practiceRatioRepairIssues({ quiz, tasks: [] }, ["c1", "c2"]), []);
});
