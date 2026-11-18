import assert from "node:assert/strict";
import test from "node:test";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank/index";
import {
  buildAdventPlan,
  findAdventItem,
  gradePick,
  normalizePrompt,
  optionOrder,
  repairPlanDoor,
  subjectOf,
  tierForDay,
  toClientQuestion,
  type AdventBankItem,
  type AdventPlan,
  type ChristmasItem,
} from "../shared/advent/assignment";
import { ADVENT_CHRISTMAS_DAYS, limitsForGrade } from "../shared/advent/rules";

/**
 * Adventi naptár — kérdéskiosztás (docs/specs/2026-11-18-adventi-naptar.md R4, 12.3; A3–A5, A34–A36, E14).
 * A közös bank a VALÓDI; a karácsonyi készlet itt szintetikus (a valódi az S1b szelet, saját teszttel).
 */

const BANK: readonly AdventBankItem[] = GRADE_QUIZ_ITEMS;

/** Szintetikus karácsonyi készlet: 110 tétel az 1–4., 90 a 3–12. évfolyamra (1–2.: 110 ≥ 96; 3–4.: 200; 5–12.: 90 ≥ 72). */
const CHRISTMAS: readonly ChristmasItem[] = [
  ...Array.from({ length: 110 }, (_, i) => ({ id: `xmas-l${String(i + 1).padStart(3, "0")}`, minGrade: 1, maxGrade: 4, prompt: `Könnyű karácsonyi kérdés ${i + 1}?`, options: ["a", "b", "c", "d"], correctIndex: i % 4, explanation: "Szintetikus tétel a kiosztás tesztjéhez." })),
  ...Array.from({ length: 90 }, (_, i) => ({ id: `xmas-h${String(i + 1).padStart(3, "0")}`, minGrade: 3, maxGrade: 12, prompt: `Karácsonyi kérdés ${i + 1}?`, options: ["a", "b", "c", "d"], correctIndex: i % 4, explanation: "Szintetikus tétel a kiosztás tesztjéhez." })),
];

const plan = (grade: number, subjectKey = "learner:abc", round = 1, used?: { ids: Set<string>; prompts: Set<string> }): AdventPlan =>
  buildAdventPlan({ bank: BANK, christmas: CHRISTMAS, grade, season: 2026, round, subjectKey, usedIds: used?.ids, usedPrompts: used?.prompts });

const item = (id: string) => {
  const found = findAdventItem(id, BANK, CHRISTMAS);
  assert.ok(found, `ismeretlen azonosító: ${id}`);
  return found;
};

test("determinisztikus: azonos alany, évad, kör, évfolyam → azonos terv (A3)", () => {
  assert.deepEqual(plan(7), plan(7));
  assert.deepEqual(plan(2), plan(2));
});

test("két alany azonos évfolyamon eltérő tervet kap (A5)", () => {
  const a = plan(7, "learner:abc");
  const b = plan(7, "learner:xyz");
  assert.notDeepEqual(Object.values(a.doors).map((d) => d[0]), Object.values(b.doors).map((d) => d[0]));
  assert.notDeepEqual(a.layout, b.layout);
});

test("a terv alakja: 24 ablak, ablakonként 1 + javítások száma kérdés, az elrendezés az 1–24 permutációja", () => {
  for (const grade of [1, 2, 3, 8, 12]) {
    const p = plan(grade);
    assert.deepEqual(Object.keys(p.doors).map(Number).sort((x, y) => x - y), Array.from({ length: 24 }, (_, i) => i + 1));
    for (const ids of Object.values(p.doors)) assert.equal(ids.length, 1 + limitsForGrade(grade).maxRepairs);
    assert.deepEqual([...p.layout].sort((x, y) => x - y), Array.from({ length: 24 }, (_, i) => i + 1));
  }
});

test("3–12. évfolyam: pontosan a 3., 6., …, 24. ablak karácsonyi, a többi a saját évfolyam bankjából (A34)", () => {
  for (let grade = 3; grade <= 12; grade++) {
    const p = plan(grade);
    for (let day = 1; day <= 24; day++) {
      const christmasDay = (ADVENT_CHRISTMAS_DAYS as readonly number[]).includes(day);
      for (const id of p.doors[day]!) {
        const q = item(id);
        assert.equal(subjectOf(q) === "christmas", christmasDay, `${grade}. évfolyam, ${day}. ablak: ${id}`);
        if ("grade" in q) assert.equal(q.grade, grade);
        else assert.ok(q.minGrade <= grade && grade <= q.maxGrade);
      }
    }
  }
});

test("bank-ablakok: egy ablak kérdései azonos tárgyúak, a szint a nappal nő, a tárgyak 3–4 ablakot kapnak", () => {
  for (let grade = 3; grade <= 12; grade++) {
    const p = plan(grade);
    const perSubject = new Map<string, number>();
    for (let day = 1; day <= 24; day++) {
      if (day % 3 === 0) continue;
      const qs = p.doors[day]!.map(item) as AdventBankItem[];
      assert.equal(new Set(qs.map((q) => q.subject)).size, 1, `${grade}. évfolyam, ${day}. ablak: vegyes tárgy`);
      assert.equal(qs[0]!.tier, tierForDay(day), `${grade}. évfolyam, ${day}. ablak: a fő kérdés szintje`);
      perSubject.set(qs[0]!.subject, (perSubject.get(qs[0]!.subject) ?? 0) + 1);
    }
    assert.equal(perSubject.size, 5);
    for (const count of perSubject.values()) assert.ok(count >= 3 && count <= 4, `${grade}. évfolyam: tárgyankénti ablakszám ${count}`);
  }
});

test("1–2. évfolyam: mind a 24 ablak az évfolyamra érvényes karácsonyi kérdés (A35)", () => {
  for (const grade of [1, 2]) {
    const p = plan(grade);
    for (const ids of Object.values(p.doors)) {
      for (const id of ids) {
        const q = item(id);
        assert.ok("minGrade" in q && q.minGrade <= grade && grade <= q.maxGrade, `${grade}. évfolyam: ${id}`);
      }
    }
  }
});

test("egy évad minden körében és javításában nincs ismétlés — azonosító és normalizált prompt szerint (A4, A36)", () => {
  for (let grade = 1; grade <= 12; grade++) {
    const { maxRounds, maxRepairs } = limitsForGrade(grade);
    const used = { ids: new Set<string>(), prompts: new Set<string>() };
    for (let round = 1; round <= maxRounds; round++) {
      const p = plan(grade, "learner:abc", round, used);
      for (const ids of Object.values(p.doors)) {
        for (const id of ids) {
          const prompt = normalizePrompt(item(id).prompt);
          assert.ok(!used.ids.has(id), `${grade}. évfolyam, ${round}. kör: ismétlődő azonosító ${id}`);
          assert.ok(!used.prompts.has(prompt), `${grade}. évfolyam, ${round}. kör: ismétlődő prompt ${id}`);
          used.ids.add(id);
          used.prompts.add(prompt);
        }
      }
    }
    assert.equal(used.ids.size, maxRounds * 24 * (1 + maxRepairs));
  }
});

test("ha a készlet kevés, hiba jön — ismétlés soha", () => {
  assert.throws(() => buildAdventPlan({ bank: BANK, christmas: CHRISTMAS.slice(0, 10), grade: 1, season: 2026, round: 1, subjectKey: "x" }), RangeError);
  assert.throws(() => buildAdventPlan({ bank: [], christmas: CHRISTMAS, grade: 7, season: 2026, round: 1, subjectKey: "x" }), RangeError);
});

test("válaszsorrend: seedelt permutáció, a kliens-alakban nincs helyes válasz, a pontozás a kevert sorrendben ért (A21)", () => {
  const q = item(plan(7).doors[1]![0]!);
  const order = optionOrder(q.id, "learner:abc", 2026);
  assert.deepEqual(order, optionOrder(q.id, "learner:abc", 2026));
  assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
  const client = toClientQuestion(q, order);
  assert.deepEqual(Object.keys(client).sort(), ["id", "options", "prompt", "subject"]);
  assert.deepEqual([...client.options].sort(), [...q.options].sort());
  for (let pick = 0; pick < 4; pick++) {
    const result = gradePick(q, order, pick);
    assert.equal(result.correct, client.options[pick] === q.options[q.correctIndex]);
    assert.equal(client.options[result.correctIndex], q.options[q.correctIndex]);
  }
  // Nem minden kérdés marad az eredeti sorrendben (különben a keverés hatástalan volna).
  const orders = Object.values(plan(7).doors).map((ids) => optionOrder(ids[0]!, "learner:abc", 2026).join(""));
  assert.ok(new Set(orders).size > 1);
});

test("E14: a bankból eltűnt kérdés helyére determinisztikusan új, még nem használt tétel lép; a többi a helyén marad", () => {
  const p = plan(7);
  const day = 1;
  const [gone, keep1, keep2] = p.doors[day]!;
  const goneItem = item(gone!) as AdventBankItem;
  const shrunk = BANK.filter((q) => q.id !== gone);
  const input = { bank: shrunk, christmas: CHRISTMAS, grade: 7, usedIds: new Set<string>(), usedPrompts: new Set<string>() };
  const fixed = repairPlanDoor(p, day, input);
  assert.equal(fixed.changed, true);
  const [replacement, same1, same2] = fixed.plan.doors[day]!;
  assert.deepEqual([same1, same2], [keep1, keep2]);
  assert.notEqual(replacement, gone);
  const replacementItem = findAdventItem(replacement!, shrunk, CHRISTMAS) as AdventBankItem;
  assert.equal(replacementItem.subject, goneItem.subject);
  assert.equal(replacementItem.grade, 7);
  assert.ok(!Object.values(p.doors).flat().includes(replacement!), "a pótlás nem lehet a tervben már szereplő kérdés");
  assert.deepEqual(repairPlanDoor(p, day, input).plan, fixed.plan);
  // Ép ablaknál nincs változás.
  assert.equal(repairPlanDoor(p, 2, input).changed, false);
  // Karácsonyi ablak pótlása a karácsonyi készletből.
  const xmasGone = p.doors[3]![0]!;
  const xmasFixed = repairPlanDoor(p, 3, { ...input, bank: BANK, christmas: CHRISTMAS.filter((c) => c.id !== xmasGone) });
  assert.equal(xmasFixed.changed, true);
  assert.match(xmasFixed.plan.doors[3]![0]!, /^xmas-/);
});
