import assert from "node:assert/strict";
import test from "node:test";

import { SECTION_KINDS, SECTION_SHAPES, applySectionShapes, assignSectionShapes, planSections, shapeBlocks, shapeSimulation, type SectionKind } from "../shared/lesson-section-shapes";
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
  // S6b (terv 13. szakasz, dokumentált spec-változás): a kiosztott blokksor a `planSections` kimenete — a minta + a try-minimum beszúrása.
  const plan = planSections(["description", "procedure", "comparison", "any"], seed);
  const ids = plan.map((p) => p.shape);
  assert.deepEqual(ids, assignSectionShapes(["description", "procedure", "comparison", "any"], seed));
  assert.ok(ids.every((id) => SECTION_SHAPES.some((s) => s.id === id)));
  assert.deepEqual(shaped.sections[0].plannedBlocks, plan[0].blocks);
  assert.deepEqual(shaped.sections[1].plannedBlocks, plan[1].blocks);
  assert.deepEqual(shaped.sections[2].plannedBlocks, plan[2].blocks);
  assert.deepEqual(shaped.sections[3].plannedBlocks, ["explain", "example", "check", "recap"], "különleges fejezet");
  const last = shaped.sections[4].plannedBlocks;
  assert.equal(last.at(-1), "recap");
  assert.deepEqual(last.filter((_, i) => i < plan[3].blocks.length), plan[3].blocks);
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

test("S6a-v2: a pedagógus-prompt a FUTÁSRA rögzített állapotot követi, nem a környezetet (KI-ben indult futás BE környezetben is KI)", async () => {
  const { buildPedagoguePrompt } = await import("../server/studio/step-io");
  const { runWithLessonVariety } = await import("../server/studio/lesson-variety-flag");
  const map = { title: "T", subject: "matematika", classroom: 5, concepts: [] };
  const saved = process.env.STUDIO_LESSON_VARIETY;
  try {
    process.env.STUDIO_LESSON_VARIETY = "on";
    const offInOnEnv = await runWithLessonVariety(false, async () => buildPedagoguePrompt(map));
    assert.doesNotMatch(offInOnEnv, /sectionKind/u, "KI futás BE környezetben: a régi prompt");
    delete process.env.STUDIO_LESSON_VARIETY;
    const onInOffEnv = await runWithLessonVariety(true, async () => buildPedagoguePrompt(map));
    assert.match(onInOffEnv, /"sectionKind"/u, "BE futás KI környezetben: fejezettípust kér");
  } finally {
    if (saved === undefined) delete process.env.STUDIO_LESSON_VARIETY; else process.env.STUDIO_LESSON_VARIETY = saved;
  }
});

test("S6a-v2: a gyártómotor a fejezetív-kiosztáshoz a futás állapotát olvassa (szerkezeti őr)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../server/studio/single-run/engine.ts", import.meta.url), "utf8");
  assert.match(src, /applySectionShapes\(plannedOutline, planned === undefined && varietyOn \? seedFrom\(mapId\) : undefined\)/u);
});

test("S6b-v2: a szerzői prompt try-fajta mondata és a szerzői hang a FUTÁS állapotát követi (KI futás BE környezetben is a régi prompt)", async () => {
  const { buildAuthorPrompt } = await import("../server/studio/step-io");
  const { runWithLessonVariety } = await import("../server/studio/lesson-variety-flag");
  const map = { title: "T", subject: "matek", classroom: 6, concepts: [{ localId: "c1", examWeight: "core" as const, term: "terület" }] };
  const sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain" as const], animationSuggestions: [] as string[] }];
  const saved = process.env.STUDIO_LESSON_VARIETY;
  try {
    process.env.STUDIO_LESSON_VARIETY = "on";
    const offInOnEnv = await runWithLessonVariety(false, async () => buildAuthorPrompt(sections, map, [], undefined, undefined, { seed: 7 }));
    assert.equal(offInOnEnv.includes("tryKind mezőt ad"), false, "KI futás: nincs try-fajta mondat");
    delete process.env.STUDIO_LESSON_VARIETY;
    assert.equal(offInOnEnv, buildAuthorPrompt(sections, map, []), "KI futás BE környezetben: bájtra a régi prompt");
    const onInOffEnv = await runWithLessonVariety(true, async () => buildAuthorPrompt(sections, map, [], undefined, undefined, { seed: 7 }));
    assert.ok(onInOffEnv.includes("tryKind mezőt ad"), "BE futás KI környezetben: van try-fajta mondat");
  } finally {
    if (saved === undefined) delete process.env.STUDIO_LESSON_VARIETY; else process.env.STUDIO_LESSON_VARIETY = saved;
  }
});

test("S6b-v2: a try-arány jelzése a futás állapotához kötött (szerkezeti őr)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../server/studio/single-run/engine.ts", import.meta.url), "utf8");
  assert.ok(src.includes("if (varietyOn) {") && !src.includes("lessonVarietyEnabled()) {"), "a motor nem olvas környezetet a futás közben");
});

// --- 1. vak kör (L1–L3): a szabályok a szerzőnek átadott VÉGLEGES blokksorokon ---

const finalRows = (kinds: readonly SectionKind[], seed: number, closingLast = true) =>
  assignSectionShapes(kinds, seed, closingLast).map((id, i) => shapeBlocks(id, closingLast && i === kinds.length - 1).join(","));

test("L1: ha van szabályos kiosztás, a program megtalálja — tíz összehasonlító fejezet a jelentett magon sem lépi túl a 40%-ot", () => {
  const kinds = Array.from({ length: 10 }, () => "comparison" as const);
  const ids = assignSectionShapes(kinds, 3379279618);
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  assert.ok(Math.max(...counts.values()) <= 4, `mintaszámok: ${JSON.stringify([...counts])}`);
});

test("L1 / L2: 3…12 fejezet × 200 mag × hat típusminta — a VÉGLEGES sorokban nincs azonos szomszéd, és egy sor ≤ 40% (felfelé kerekítve)", () => {
  const patterns: Array<(i: number, s: number) => SectionKind> = [
    () => "any", () => "comparison", () => "description", () => "procedure",
    (i, s) => SECTION_KINDS[(i + s) % SECTION_KINDS.length], (i) => (i % 2 ? "comparison" : "description"),
  ];
  for (const [p, pattern] of patterns.entries()) {
    for (let n = 3; n <= 12; n++) {
      for (let s = 0; s < 200; s++) {
        const kinds = Array.from({ length: n }, (_, i) => pattern(i, s));
        for (const closingLast of [true, false]) {
          const rows = finalRows(kinds, seedFrom(`r${s}`), closingLast);
          for (let i = 1; i < n; i++) assert.notEqual(rows[i], rows[i - 1], `minta ${p}, ${n}/${s}, zárás ${closingLast}: azonos szomszédos sor (${i})`);
          const counts = new Map<string, number>();
          for (const row of rows) counts.set(row, (counts.get(row) ?? 0) + 1);
          assert.ok(Math.max(...counts.values()) <= Math.ceil(0.4 * n), `minta ${p}, ${n}/${s}, zárás ${closingLast}: egy sor ${Math.max(...counts.values())} / ${n}`);
        }
      }
    }
  }
});

test("L2: a jelentett eset — négy „any” fejezetnél a záró recap nem olvaszt azonos sorrá két szomszédot, és a terv sorai is különböznek", () => {
  const seed = seedFrom("00000000-0000-4000-8000-000000000030");
  const shaped = applySectionShapes(outline(["A", "B", "C", "D"].map((heading) => ({ heading, plannedBlocks: ["explain", "example", "check"], sectionKind: "any" as const }))), seed);
  const rows = shaped.sections.map((s) => s.plannedBlocks.join(","));
  for (let i = 1; i < rows.length; i++) assert.notEqual(rows[i], rows[i - 1], `azonos szomszédos sor: ${rows[i]}`);
  assert.ok(Math.max(...rows.map((r) => rows.filter((x) => x === r).length)) <= 2, `sorok: ${JSON.stringify(rows)}`);
  assert.equal(shaped.sections.at(-1)!.plannedBlocks.at(-1), "recap");
});

test("L3: a különleges záró fejezet recap nélküli tervét a program recap-pal zárja; más különleges fejezet és a recap-os zárás változatlan", () => {
  const seed = seedFrom("map-3");
  const open = applySectionShapes(outline([
    { heading: "A tört", plannedBlocks: ["explain", "example", "check"] },
    { heading: SECTION_ROLE_HEADING.mistakes, plannedBlocks: ["explain", "example", "check"] },
    { heading: SECTION_ROLE_HEADING.selfCheck, plannedBlocks: ["explain", "animate"] },
  ]), seed);
  assert.deepEqual(open.sections[1].plannedBlocks, ["explain", "example", "check"], "nem záró különleges fejezet változatlan");
  assert.deepEqual(open.sections[2].plannedBlocks, ["explain", "animate", "recap"]);
  const closed = applySectionShapes(outline([
    { heading: "A tört", plannedBlocks: ["explain", "example", "check"] },
    { heading: SECTION_ROLE_HEADING.selfCheck, plannedBlocks: ["explain", "animate", "recap"] },
  ]), seed);
  assert.deepEqual(closed.sections[1].plannedBlocks, ["explain", "animate", "recap"]);
  // A fogalom-fejezet itt NEM a lecke zárása: nem kap pótolt recap-ot (a mintája szerinti sor marad).
  // S6b (dokumentált spec-változás): a kiosztott sor a `planSections` kimenete (minta + try-minimum), záró recap nélkül.
  const planned = planSections(["any"], seed, false)[0];
  assert.deepEqual(closed.sections[0].plannedBlocks, planned.blocks);
  assert.notEqual(planned.blocks.at(-1) === "recap" && !shapeBlocks(planned.shape, false).includes("recap"), true, "nincs pótolt recap");
});

test("L5: a szimuláció üres mintára hibát ad (nem „megfelelt”)", () => {
  assert.throws(() => shapeSimulation([], 400), /fejezetszám/u);
  assert.throws(() => shapeSimulation([3, 4], 0), /leckeszám/u);
});

test("S6b + S6a követelmény: a try-pótlás UTÁN is — a végleges sorokban nincs azonos szomszéd, egy sor ≤ 40%, és a try-minimum teljesül", () => {
  const patterns: Array<(i: number, s: number) => SectionKind> = [
    () => "any", () => "comparison", () => "description", () => "procedure", (i, s) => SECTION_KINDS[(i + s) % SECTION_KINDS.length],
  ];
  for (const [p, pattern] of patterns.entries()) {
    for (let n = 3; n <= 12; n++) {
      for (let s = 0; s < 200; s++) {
        const kinds = Array.from({ length: n }, (_, i) => pattern(i, s));
        for (const closingLast of [true, false]) {
          const plan = planSections(kinds, seedFrom(`t${s}`), closingLast);
          const rows = plan.map((x) => x.blocks.join(","));
          assert.ok(plan.filter((x) => x.blocks.includes("try")).length >= Math.ceil(n / 3), `minta ${p}, ${n}/${s}: kevés try`);
          for (let i = 1; i < n; i++) assert.notEqual(rows[i], rows[i - 1], `minta ${p}, ${n}/${s}, zárás ${closingLast}: azonos szomszédos sor (${i}): ${rows[i]}`);
          const top = Math.max(...rows.map((r) => rows.filter((x) => x === r).length));
          assert.ok(top <= Math.ceil(0.4 * n), `minta ${p}, ${n}/${s}, zárás ${closingLast}: egy sor ${top} / ${n}`);
          if (closingLast) assert.equal(plan.at(-1)!.blocks.at(-1), "recap");
        }
      }
    }
  }
});
