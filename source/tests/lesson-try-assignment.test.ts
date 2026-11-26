import test from "node:test";
import assert from "node:assert/strict";
import { seedFrom } from "../shared/seeded";
import { planSections, numericSubject, type SectionKind } from "../shared/lesson-section-shapes";
import { PROMPT_TRY_KINDS } from "../shared/lesson-schema";

/** V2b (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): az öt új gyakorlófajta a gyártásban. */
const PRACTICE = ["dragSort", "fillBlank", "match", "trueFalseSeries", "highlight", "categorize", "numberLine", "estimate"];

test("300 magon minden gyakorlófajta előfordul (számtárgyban); nem számtárgyban nincs numberLine / estimate; a szomszédos any-try eltér", () => {
  const seen = { num: new Set<string>(), plain: new Set<string>() };
  const kinds: SectionKind[] = ["any", "description", "comparison", "procedure", "any", "any"];
  for (let s = 0; s < 300; s++) {
    for (const numeric of [true, false]) {
      const plan = planSections(kinds, seedFrom(`v2b-${s}`), true, { numeric });
      for (const p of plan) if (p.tryKind) (numeric ? seen.num : seen.plain).add(p.tryKind);
      if (!numeric) for (const p of plan) assert.ok(!["numberLine", "estimate"].includes(p.tryKind ?? ""), `${s}: számos fajta nem számtárgyban`);
      const anyTries = plan.map((p, i) => ({ p, i })).filter(({ p, i }) => p.tryKind && kinds[i] === "any");
      for (let k = 1; k < anyTries.length; k++) {
        const prev = plan.slice(0, anyTries[k].i).reverse().find((p) => p.tryKind);
        if (prev) assert.notEqual(anyTries[k].p.tryKind, prev.tryKind, `${s}: egymást követő azonos try`);
      }
    }
  }
  for (const k of PRACTICE) assert.ok(seen.num.has(k), `számtárgy: ${k} nem fordult elő`);
  for (const k of PRACTICE.filter((k) => k !== "numberLine" && k !== "estimate")) assert.ok(seen.plain.has(k), `nem számtárgy: ${k}`);
  assert.deepEqual(planSections(kinds, 7, true, { numeric: true }), planSections(kinds, 7, true, { numeric: true }));
});

test("számtárgy a tantárgynévből", () => {
  for (const s of ["Matematika", "matek", "Fizika", "Kémia", "Földrajz", "Természettudomány", "Informatika"]) assert.equal(numericSubject(s), true, s);
  for (const s of ["Magyar nyelv", "Történelem", "Angol", "Ének-zene"]) assert.equal(numericSubject(s), false, s);
});

test("a szerző és a vázlat az öt új gyakorlófajtát ismeri, pontos spec-alakkal; a kártyák (V3) még nem", async () => {
  for (const k of PRACTICE) assert.ok((PROMPT_TRY_KINDS as readonly string[]).includes(k), k);
  for (const k of ["flipCard", "stepReveal", "didYouKnow", "decision", "flashcards"]) assert.ok(!(PROMPT_TRY_KINDS as readonly string[]).includes(k), k);
  const { AUTHOR_BLOCK_CATALOG, AUTHOR_BLOCK_CATALOG_VARIETY } = await import("../server/studio/step-io");
  const catalog = AUTHOR_BLOCK_CATALOG_VARIETY;
  // KI kapcsolónál a régi katalógus bájtra változatlan (új fajta nélkül).
  const tryLine = AUTHOR_BLOCK_CATALOG.split("\n").find((l) => l.startsWith('- { "kind": "try"'))!;
  for (const k of ["trueFalseSeries", "highlight", "categorize", "numberLine", "estimate"]) assert.ok(!tryLine.includes(`"${k}"`), `alapkatalógus: ${k}`);
  assert.ok(!AUTHOR_BLOCK_CATALOG.includes("trueFalseSeries"), "a V2b-mondat csak a kiegészítésben");
  for (const [k, field] of [["trueFalseSeries", "statements"], ["highlight", "targets"], ["categorize", "categories"], ["numberLine", "tolerance"], ["estimate", "answer"]]) {
    assert.ok(catalog.includes(`"${k}"`) && catalog.includes(`"${field}"`), `${k}: ${field}`);
  }
});
