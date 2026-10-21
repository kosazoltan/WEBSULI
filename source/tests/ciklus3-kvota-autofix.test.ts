import test from "node:test";
import assert from "node:assert/strict";
import { autofixBankPacket } from "../server/studio/tools/bank-packet-autofix";
import { requiredDistinctSchema } from "../shared/lesson-experience";

/* Spec 2026-10-21-ciklus3: a kategóriakvóta sémahibáinak gépi javítása (mért: 7 + 7 bankjavítókör / 98 futás). */

const packet = (task: Record<string, unknown>) => ({ methods: [], quiz: [], tasks: [{ id: "t1", q: "Írj 3 főnevet!", sample: "kutya, alma, Budapest", minWords: 3, needsSentence: false, mode: "written", bonus: [], ...task }] });

test("ciklus3: a kvóta csoportjai közt ismétlődő elem csak az első csoportban marad — a séma elfogadja", () => {
  const rule = { category: "főnév", count: 3, from: [["kutya", "eb"], ["Kutya", "alma"], ["alma"], ["Budapest"]] };
  const before = requiredDistinctSchema.safeParse(rule);
  assert.equal(before.success, false, "előfeltétel: a séma elutasítja");
  const { packet: out, fixes } = autofixBankPacket(packet({ required: [["főnév"]], requiredDistinct: [rule] }), {} as never);
  const fixed = (out as { tasks: Array<{ requiredDistinct: unknown[] }> }).tasks[0].requiredDistinct[0];
  assert.deepEqual(fixed, { category: "főnév", count: 3, from: [["kutya", "eb"], ["alma"], ["Budapest"]] });
  assert.ok(requiredDistinctSchema.safeParse(fixed).success);
  assert.ok(fixes.some((f) => /kategóriakvóta ismétlődő/.test(f)), JSON.stringify(fixes));
});

test("ciklus3: ha az ismétlődés miatt kevesebb csoport marad, a darabszám a csoportok száma", () => {
  const rule = { category: "gyümölcs", count: 3, from: [["alma"], ["Alma"], ["körte"]] };
  const { packet: out } = autofixBankPacket(packet({ required: [["gyümölcs"]], requiredDistinct: [rule] }), {} as never);
  const fixed = (out as { tasks: Array<{ requiredDistinct: Array<{ count: number; from: string[][] }> }> }).tasks[0].requiredDistinct[0];
  assert.equal(fixed.count, 2);
  assert.deepEqual(fixed.from, [["alma"], ["körte"]]);
});

test("ciklus3: a felsoroló feladat üres required-je a kvóta bármely elemét elfogadja; kvóta nélkül nem nyúl hozzá", () => {
  const rule = { category: "főnév", count: 2, from: [["kutya"], ["alma"]] };
  const { packet: out, fixes } = autofixBankPacket(packet({ required: [], requiredDistinct: [rule] }), {} as never);
  assert.deepEqual((out as { tasks: Array<{ required: string[][] }> }).tasks[0].required, [["kutya", "alma"]]);
  assert.ok(fixes.some((f) => /üres required/.test(f)));
  const { packet: untouched } = autofixBankPacket(packet({ required: [] }), {} as never);
  assert.deepEqual((untouched as { tasks: Array<{ required: string[][] }> }).tasks[0].required, []);
});
