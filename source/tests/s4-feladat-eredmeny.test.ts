import test from "node:test";
import assert from "node:assert/strict";
import { gradeTasks, tightenedOnlyMiss } from "../shared/lesson-result-email";
import { RELAX_MIN_ANSWERED, relaxTask } from "../server/task-results";
import type { OpenTask } from "../shared/lesson-experience";

/* Spec 2026-10-20-s4 (S4b + S4c): a feladatszintű sor mezői és a lazítás tiszta döntése. */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mi történik a gáz térfogatával, ha melegítjük?",
  required: [["gáz", "gázok"], ["térfogat", "térfogata"], ["nő"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "Melegítéskor a gáz térfogata nő.", mode: "written", tightened: [["nő"]], ...over,
}) as OpenTask;

test("S4b: a sor feladat-azonosítót, pontozói állapotot, döntőbírói emelést és „csak a szigorítás miatt bukott” jelet ad", () => {
  const t = task();
  const g = gradeTasks([t], { t1: "Melegítéskor a gáz térfogata megnövekszik." }, () => ({ state: "ok", score: 1 }));
  assert.equal(g.rows[0].taskId, "t1");
  assert.equal(g.rows[0].detState, "partial");
  assert.equal(g.rows[0].state, "ok");
  assert.equal(g.rows[0].arbiterRaised, true);
  assert.equal(g.rows[0].tightenedOnlyMiss, true);
  const plain = gradeTasks([t], { t1: "Melegítéskor a gáz térfogata nő." });
  assert.equal(plain.rows[0].arbiterRaised, false);
  assert.equal(plain.rows[0].tightenedOnlyMiss, false, "teljes pont: nem bukott");
});

test("review #340 (P1): ellenpróba — ha a szigorított csoport nélkül sem teljes pont (pl. túl rövid), nem „csak a szigorítás miatt”", () => {
  const t = task({ minWords: 8 });
  assert.equal(tightenedOnlyMiss(t, "A gáz térfogata megnövekszik.", "partial"), false, "a szóminimum miatt is bukik");
  assert.equal(tightenedOnlyMiss(task(), "Melegítéskor a gáz térfogata megnövekszik.", "partial"), true);
});

test("S4b: nem „csak a szigorítás miatt”, ha más csoport is hiányzik, vagy a feladat nem szigorított", () => {
  assert.equal(tightenedOnlyMiss(task(), "A térfogata megnövekszik melegítéskor.", "partial"), false, "a „gáz” csoport is hiányzik");
  const { tightened: _t, ...plain } = task();
  assert.equal(tightenedOnlyMiss(plain as OpenTask, "Melegítéskor a gáz térfogata megnövekszik.", "partial"), false);
});

test("S4c: a küszöb alatt nincs lazítás; fölötte a szigorított csoport bónusz lesz, a többi kötelező marad", () => {
  const now = new Date("2026-10-27T09:00:00Z");
  assert.equal(relaxTask(task(), { answered: RELAX_MIN_ANSWERED - 1, falseRejects: 19 }, now), null, "kevés kör");
  assert.equal(relaxTask(task(), { answered: 20, falseRejects: 7 }, now), null, "35 % < 40 %");
  const out = relaxTask(task(), { answered: 20, falseRejects: 8 }, now)!;
  assert.deepEqual(out.required, [["gáz", "gázok"], ["térfogat", "térfogata"]]);
  assert.deepEqual(out.bonus, [["nő"]]);
  assert.equal("tightened" in out, false);
  assert.deepEqual(out.relaxedTightening, { at: now.toISOString(), answered: 20, falseRejects: 8 });
  assert.equal(relaxTask(out, { answered: 40, falseRejects: 40 }, now), null, "már lazított");
});

test("S4c: ha minden kötelező csoport szigorított volt, legalább egy kötelező marad", () => {
  const out = relaxTask(task({ required: [["nő"], ["kitágul"]], tightened: [["nő"], ["kitágul"]] }), { answered: 30, falseRejects: 20 }, new Date())!;
  assert.equal(out.required.length, 1);
  assert.equal(out.bonus.length, 1);
});
