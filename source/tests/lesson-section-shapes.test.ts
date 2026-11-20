import assert from "node:assert/strict";
import test from "node:test";

import { SECTION_KINDS, SECTION_SHAPES, applySectionShapes, assignSectionShapes, shapeSimulation, type SectionKind } from "../shared/lesson-section-shapes";
import { checkLessonArc } from "../shared/lesson-arc";
import { SECTION_ROLE_HEADING } from "../shared/lesson-ui-text";
import { seedFrom } from "../shared/seeded";
import type { Lesson } from "../shared/lesson-schema";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (12. szakasz; V13–V16): fejezetív-készlet, determinisztikus kiosztás.

test("V13: mind a hat minta átmegy az ívkapun (nyitóblokkokkal, záró recap-pal)", () => {
  assert.equal(SECTION_SHAPES.length, 6);
  for (const shape of SECTION_SHAPES) {
    for (const position of ["first", "middle", "last"] as const) {
      const blocks = (kinds: readonly string[]) => kinds.map((kind) => ({ kind })) as unknown as Lesson["sections"][number]["blocks"];
      const own = [...shape.blocks, ...(position === "last" && shape.blocks.at(-1) !== "recap" ? ["recap"] : [])];
      const sections = [
        { heading: "Nyitó", blocks: blocks(position === "first" ? ["explain", "explain", ...own] : ["explain", "explain", "explain", "example", "animate", "check"]) },
        ...(position === "middle" ? [{ heading: "Közép", blocks: blocks(own) }] : []),
        // A kitöltő fejezetek hordozzák a lecke-szintű „megmutató réteget” (animate) — itt a minta SAJÁT fejezetszabályait mérjük; a
        // lecke-szintű szabályt a kiosztás garantálja (V14: legalább egy megmutató minta).
        ...(position !== "first" ? [{ heading: "Vég", blocks: blocks(position === "last" ? own : ["explain", "example", "animate", "check", "recap"]) }] : [{ heading: "Vég", blocks: blocks(["explain", "example", "animate", "check", "recap"]) }]),
      ];
      const report = checkLessonArc({ sections } as unknown as Lesson);
      assert.equal(report.ok, true, `${shape.id}/${position}: ${report.reasons.join(" | ")}`);
    }
  }
});

test("V14: szomszéd nem azonos, egy minta ≤ 40% (felfelé kerekítve), 3…12 fejezet × 200 mag; determinisztikus; illeszkedés", () => {
  for (let n = 1; n <= 12; n++) {
    for (let s = 0; s < 200; s++) {
      const kinds = Array.from({ length: n }, (_, i) => SECTION_KINDS[(i + s) % SECTION_KINDS.length]);
      const seed = seedFrom(`m${s}`);
      const out = assignSectionShapes(kinds, seed);
      assert.deepEqual(out, assignSectionShapes(kinds, seed));
      assert.equal(out.length, n);
      for (let i = 1; i < n; i++) assert.notEqual(out[i], out[i - 1], `${n}/${s}: szomszéd ${i}`);
      const cap = Math.ceil(0.4 * n);
      const counts = new Map<string, number>();
      for (const id of out) counts.set(id, (counts.get(id) ?? 0) + 1);
      if (n >= 3) for (const [id, c] of counts) assert.ok(c <= cap, `${n}/${s}: ${id} ${c} > ${cap}`);
      // Az ívkapu lecke-szintű szabálya (legalább egy animate / try): a kiosztás mindig ad megmutató mintát.
      assert.ok(out.some((id) => SECTION_SHAPES.find((sh) => sh.id === id)!.blocks.some((b) => b === "animate" || b === "try")), `${n}/${s}: nincs megmutató minta`);
      out.forEach((id, i) => {
        const shape = SECTION_SHAPES.find((sh) => sh.id === id)!;
        assert.ok(kinds[i] === "any" || shape.fits.includes(kinds[i]), `${id} nem illik: ${kinds[i]}`);
      });
    }
  }
});

const outline = (sections: Array<{ heading: string; plannedBlocks: string[]; sectionKind?: SectionKind }>) => ({
  sections: sections.map((s) => ({ conceptIds: ["c1"], animationSuggestions: [], ...s })),
  misconceptions: [],
});

test("V15: BE — a fogalom-fejezetek a kiosztott mintát kapják; különleges fejezet változatlan; záró recap", () => {
  const raw = outline([
    { heading: "A tört", plannedBlocks: ["explain", "example", "check", "recap"], sectionKind: "description" },
    { heading: "Bővítés", plannedBlocks: ["explain", "example", "check"], sectionKind: "procedure" },
    { heading: "Összevetés", plannedBlocks: ["explain", "example", "check"], sectionKind: "comparison" },
    { heading: SECTION_ROLE_HEADING.mistakes, plannedBlocks: ["explain", "example", "check", "recap"] },
    { heading: "Utolsó", plannedBlocks: ["explain", "example", "check", "recap"] },
  ]);
  const seed = seedFrom("map-1");
  const shaped = applySectionShapes(raw, seed);
  const ids = assignSectionShapes(["description", "procedure", "comparison", "any"], seed);
  const blocksOf = (id: string) => [...SECTION_SHAPES.find((s) => s.id === id)!.blocks];
  assert.deepEqual(shaped.sections[0].plannedBlocks, blocksOf(ids[0]));
  assert.deepEqual(shaped.sections[1].plannedBlocks, blocksOf(ids[1]));
  assert.deepEqual(shaped.sections[2].plannedBlocks, blocksOf(ids[2]));
  assert.deepEqual(shaped.sections[3].plannedBlocks, ["explain", "example", "check", "recap"], "különleges fejezet");
  const last = shaped.sections[4].plannedBlocks;
  assert.equal(last.at(-1), "recap");
  assert.deepEqual(last.filter((_, i) => i < blocksOf(ids[3]).length), blocksOf(ids[3]));
  for (const s of shaped.sections) assert.equal("sectionKind" in s, false, "a sectionKind nem megy tovább");
  assert.deepEqual(raw.sections[0].plannedBlocks, ["explain", "example", "check", "recap"], "a bemenet nem mutálódik");
});

test("V15: KI (mag nélkül) — ugyanaz az objektum; kéretlen sectionKind eldobva, más nem változik", () => {
  const plain = outline([{ heading: "A", plannedBlocks: ["explain", "example", "check", "recap"] }]);
  assert.equal(applySectionShapes(plain, undefined), plain);
  const stray = outline([{ heading: "A", plannedBlocks: ["explain", "check"], sectionKind: "procedure" }]);
  const out = applySectionShapes(stray, undefined);
  assert.deepEqual(out, outline([{ heading: "A", plannedBlocks: ["explain", "check"] }]));
});

test("V16: szimuláció — leggyakoribb minta < 35%, azonos minta valószínűsége < 20%", () => {
  const counts = [3, 4, 4, 5, 5, 5, 6, 6, 7, 8, 9, 10, 12];
  const sim = shapeSimulation(counts, 400);
  assert.ok(sim.topShare < 0.35, `leggyakoribb ${sim.topShare}`);
  assert.ok(sim.samePatternProbability < 0.2, `azonos ${sim.samePatternProbability}`);
  assert.deepEqual(sim, shapeSimulation(counts, 400), "determinisztikus");
});

test("V15: a pedagógus-prompt KI bájtra a régi; BE fejezettípust kér, és nem írja elő az egyetlen ívet", async () => {
  const { buildPedagoguePrompt } = await import("../server/studio/step-io");
  const map = { title: "T", subject: "matematika", classroom: 5, concepts: [] };
  const saved = process.env.STUDIO_LESSON_VARIETY;
  try {
    delete process.env.STUDIO_LESSON_VARIETY;
    const off = buildPedagoguePrompt(map);
    assert.match(off, /Fogalomcsoportonként egy fejezet: explain → example \(lépésről lépésre\) → check/u);
    assert.match(off, /A plannedBlocks sorrendje EZT az ívet kövesse/u);
    assert.doesNotMatch(off, /sectionKind/u);
    process.env.STUDIO_LESSON_VARIETY = "on";
    const on = buildPedagoguePrompt(map);
    assert.doesNotMatch(on, /Fogalomcsoportonként egy fejezet: explain → example/u);
    assert.doesNotMatch(on, /A plannedBlocks sorrendje EZT az ívet kövesse/u);
    assert.match(on, /"sectionKind": "procedure" \| "description" \| "comparison" \| "any"/u);
    assert.match(on, /a program osztja ki/u);
    // A különleges fejezetek mintája megmarad.
    assert.ok(on.includes(SECTION_ROLE_HEADING.mistakes));
  } finally {
    if (saved === undefined) delete process.env.STUDIO_LESSON_VARIETY; else process.env.STUDIO_LESSON_VARIETY = saved;
  }
});
