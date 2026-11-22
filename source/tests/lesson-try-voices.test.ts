import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SECTION_KINDS, applySectionShapes, planSections, shapeSimulation, tryShare, type SectionKind } from "../shared/lesson-section-shapes";
import { BAND_VOICES, bandVoiceForPrompt } from "../shared/lesson-band";
import { AGE_BANDS } from "../shared/lesson-schema";
import { seedFrom } from "../shared/seeded";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (13. szakasz; V17–V20).

const KIND_TRY: Record<Exclude<SectionKind, "any">, string> = { procedure: "dragSort", comparison: "match", description: "fillBlank" };

test("V17: ≥ 1/3 try, a fajta a típushoz illik, egymást követő try nem azonos (any-nél), 3…12 fejezet × 200 mag", () => {
  for (let n = 3; n <= 12; n++) {
    for (let s = 0; s < 200; s++) {
      const kinds = Array.from({ length: n }, (_, i) => (s % 3 === 0 ? "any" : SECTION_KINDS[(i * 7 + s) % SECTION_KINDS.length]) as SectionKind);
      const plan = planSections(kinds, seedFrom(`t${s}`));
      assert.deepEqual(plan, planSections(kinds, seedFrom(`t${s}`)));
      const withTry = plan.filter((p) => p.blocks.includes("try"));
      assert.ok(withTry.length >= Math.ceil(n / 3), `${n}/${s}: ${withTry.length} try`);
      plan.forEach((p, i) => {
        assert.equal(p.blocks.includes("try"), p.tryKind !== undefined, `${n}/${s}/${i}: tryKind ↔ try`);
        if (p.tryKind && kinds[i] !== "any") assert.equal(p.tryKind, KIND_TRY[kinds[i] as Exclude<SectionKind, "any">]);
        // A try nem kerülhet a kérdés után és nem nyithat (az ív szabálya: magyarázat elöl).
        assert.equal(p.blocks[0], "explain");
      });
      const anyTries = plan.map((p, i) => ({ p, i })).filter(({ p, i }) => p.tryKind && kinds[i] === "any");
      for (let k = 1; k < anyTries.length; k++) {
        const prev = plan.slice(0, anyTries[k].i).reverse().find((p) => p.tryKind);
        if (prev) assert.notEqual(anyTries[k].p.tryKind, prev.tryKind, `${n}/${s}: egymást követő azonos try`);
      }
    }
  }
});

test("V17: a terv fejezete tryKind-ot hordoz; KI-nél a kéretlen tryKind is eldobva", () => {
  const outline = { sections: Array.from({ length: 6 }, (_, i) => ({ heading: `F${i}`, conceptIds: ["c"], plannedBlocks: ["explain", "example", "check"], animationSuggestions: [], sectionKind: "procedure" as const })), misconceptions: [] };
  const shaped = applySectionShapes(outline, 42);
  const tries = shaped.sections.filter((s) => s.plannedBlocks.includes("try"));
  assert.ok(tries.length >= 2);
  for (const s of shaped.sections) assert.equal((s as { tryKind?: string }).tryKind, s.plannedBlocks.includes("try") ? "dragSort" : undefined);
  const stray = { sections: [{ heading: "A", conceptIds: ["c"], plannedBlocks: ["explain"], animationSuggestions: [], tryKind: "match" }], misconceptions: [] };
  assert.deepEqual(applySectionShapes(stray, undefined), { sections: [{ heading: "A", conceptIds: ["c"], plannedBlocks: ["explain"], animationSuggestions: [] }], misconceptions: [] });
});

test("V18: tryShare a try-t tartalmazó fejezetek aránya; a motor BE-nél telemetriába írja és 1/3 alatt jelez", () => {
  const lesson = (rows: string[][]) => ({ sections: rows.map((r) => ({ blocks: r.map((kind) => ({ kind })) })) });
  assert.equal(tryShare(lesson([["explain", "try"], ["explain"], ["explain"]])), 0.33);
  assert.equal(tryShare(lesson([["explain", "try"], ["try"], ["explain"]])), 0.67);
  assert.equal(tryShare(lesson([])), 0);
  const engine = readFileSync(new URL("../server/studio/single-run/engine.ts", import.meta.url), "utf8");
  // S6b-v2 (dokumentált változás az S5a-v2 invariánsa szerint): a jelzés a FUTÁSRA rögzített állapothoz kötött, nem a környezethez.
  assert.match(engine, /if \(varietyOn\) \{\s*const share = tryShare\(lesson\);\s*telemetry\.gates\.tryShare = share;/u);
  assert.match(engine, /reason: "try_share_low"/u);
});

test("V19: sávonként 3 hang, 2–3 mondat, a tények nem változnak; determinisztikus; 50 magon ≥ 2 hang", () => {
  for (const band of AGE_BANDS) {
    assert.equal(BAND_VOICES[band].length, 3);
    for (const v of BAND_VOICES[band]) {
      const sentences = v.text.split(/(?<=[.!?])\s+/u).filter(Boolean).length;
      assert.ok(sentences >= 2 && sentences <= 3, `${band}/${v.id}: ${sentences}`);
    }
    const seen = new Set<string>();
    for (let s = 0; s < 50; s++) {
      const line = bandVoiceForPrompt(band, seedFrom(`v${s}`));
      assert.equal(line, bandVoiceForPrompt(band, seedFrom(`v${s}`)));
      assert.match(line, /facts and the wording of the concepts/u);
      seen.add(line);
    }
    assert.ok(seen.size >= 2, `${band}: ${seen.size} hang`);
  }
});

test("V19: a szerző-prompt KI bájtra a régi (mag mellett is); BE a hangot és a tryKind-szabályt kéri", async () => {
  const { buildAuthorPrompt } = await import("../server/studio/step-io");
  const map = { title: "T", subject: "matek", classroom: 6, concepts: [{ localId: "c1", examWeight: "core" as const, term: "terület" }] };
  const sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain" as const, "try" as const], animationSuggestions: [] as string[] }];
  const saved = process.env.STUDIO_LESSON_VARIETY;
  try {
    delete process.env.STUDIO_LESSON_VARIETY;
    assert.equal(buildAuthorPrompt(sections, map, [], undefined, undefined, { seed: 3 }), buildAuthorPrompt(sections, map, []));
    process.env.STUDIO_LESSON_VARIETY = "on";
    const on = buildAuthorPrompt(sections, map, [], undefined, undefined, { seed: 3 });
    assert.ok(on.includes(bandVoiceForPrompt("teen", 3)));
    assert.match(on, /tryKind/u);
  } finally {
    if (saved === undefined) delete process.env.STUDIO_LESSON_VARIETY; else process.env.STUDIO_LESSON_VARIETY = saved;
  }
});

test("V20: a szimuláció a try-beszúrással is a küszöb alatt", () => {
  const sim = shapeSimulation([3, 4, 4, 5, 5, 5, 6, 6, 7, 8, 9, 10, 12], 400);
  assert.ok(sim.topShare < 0.35 && sim.samePatternProbability < 0.2, JSON.stringify(sim));
});
