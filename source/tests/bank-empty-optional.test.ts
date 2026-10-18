import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStrictPacket } from "../server/studio/bank-schema";
import { autofixBankPacket } from "../server/studio/tools/bank-packet-autofix";
import { methodSchema, openTaskSchema } from "../shared/lesson-experience";

// docs/specs/2026-10-18-bank-ures-lista.md — élő bukás 2026-10-18 10:27: „A 3. fejezet bankcsomagja a javító kör után sem
// megfelelő: too_small … tasks.0.typedAnswers … tasks.0.requiredDistinct …”: a modell a választható listát `[]`-ként adta.

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, sectionIndex: 2, coversConceptIds: ["c1"], q: "Mit jelent a fotoszintézis?", required: [["fény", "napfény"]], bonus: [],
  minWords: 3, needsSentence: false, sample: "A növény fény segítségével cukrot készít.", mode: "written", ...extra,
});

test("a képernyőképen látott alak: üres typedAnswers / requiredDistinct → hiányzó mező, a feladatséma elfogadja", () => {
  const raw = { methods: [], quiz: [], glossary: [], tasks: [0, 1, 2].map(i => task(`t${i}`, { typedAnswers: [], requiredDistinct: [] })) };
  for (const t of raw.tasks) assert.equal(openTaskSchema.safeParse(t).success, false, "a nyers alak a régi hiba");
  const norm = normalizeStrictPacket(raw) as { tasks: Array<Record<string, unknown>> };
  for (const t of norm.tasks) {
    assert.equal("typedAnswers" in t, false);
    assert.equal("requiredDistinct" in t, false);
    assert.equal(openTaskSchema.safeParse(t).success, true, JSON.stringify(openTaskSchema.safeParse(t).error?.issues));
  }
});

test("az automatikus javító a mentett csomagon is elhagyja az üres választható listát, és naplózza", () => {
  const saved = {
    tasks: [task("t0", { typedAnswers: [], requiredDistinct: [] })],
    methods: [{ id: "m0", sectionIndex: 2, coversConceptIds: ["c1"], kind: "prediction", title: "Jósolj", prompt: "Mi lesz?", answer: "Ez.", options: [], steps: [] }],
    quiz: [],
  };
  const { packet, fixes } = autofixBankPacket(saved, { sectionIndex: 2, allowedConceptIds: ["c1"] });
  const p = packet as { tasks: Array<Record<string, unknown>>; methods: Array<Record<string, unknown>> };
  assert.equal("typedAnswers" in p.tasks[0], false);
  assert.equal("requiredDistinct" in p.tasks[0], false);
  assert.equal("options" in p.methods[0], false);
  assert.equal("steps" in p.methods[0], false);
  assert.equal(methodSchema.safeParse(p.methods[0]).success, true);
  assert.ok(fixes.some(f => f.includes("t0: üres typedAnswers elhagyva")));
});

test("a kötelező üres lista továbbra is hiba; a kitöltött típusos válasz érintetlen", () => {
  const norm = normalizeStrictPacket({ tasks: [task("t0", { required: [] }), task("t1", { typedAnswers: [{ part: "a", kind: "number", value: "12", unit: null, form: null }] })] }) as { tasks: Array<Record<string, unknown>> };
  assert.equal(openTaskSchema.safeParse(norm.tasks[0]).success, false, "üres required: valódi hiba marad");
  assert.deepEqual(norm.tasks[1].typedAnswers, [{ part: "a", kind: "number", value: "12" }]);
  assert.equal(openTaskSchema.safeParse(norm.tasks[1]).success, true);
});
