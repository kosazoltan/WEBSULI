import test from "node:test";
import assert from "node:assert/strict";
import { bossProblems, pickVarietyAxes, varietyAxesContract, wordGameProblems, WORD_GAMES, avoidSeriesRepeat } from "../shared/lesson-variety-axes";
import { lessonSchema } from "../shared/lesson-schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V5b (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): boss-kérdés és szójáték a gyártásban. */
type L = ReturnType<typeof fusionFixture>;
const withSections = (n: number): L => {
  const l = structuredClone(fusionFixture());
  while (l.sections.length < n) l.sections.push(structuredClone(l.sections[l.sections.length - 1]));
  l.sections = l.sections.slice(0, n);
  return l;
};
const checks = (l: L) => l.sections.flatMap((s, si) => s.blocks.map((b, bi) => ({ b: b as Record<string, unknown>, si, bi })).filter((x) => x.b.kind === "check"));

test("a check blokk boss jelölője a sémában érvényes (régi lecke jelölő nélkül is)", () => {
  const l = withSections(3);
  const last = checks(l).at(-1)!;
  (l.sections[last.si].blocks[last.bi] as Record<string, unknown>).boss = true;
  assert.equal(lessonSchema.safeParse(l).success, true);
  assert.equal(lessonSchema.safeParse(withSections(3)).success, true);
});

test("boss-kapu: ≥ 3 fejezetnél pontosan egy, az utolsó kérdéses fejezetben, ≥ 2 fogalommal", () => {
  const l = withSections(3);
  assert.ok(bossProblems(l).length > 0, "hiányzik");
  const ok = structuredClone(l);
  const last = checks(ok).at(-1)!;
  const blk = ok.sections[last.si].blocks[last.bi] as Record<string, unknown>;
  blk.boss = true;
  const ids = [...new Set(ok.sections.flatMap((s) => s.blocks.flatMap((b) => ((b as { coversConceptIds?: string[] }).coversConceptIds ?? []))))];
  blk.coversConceptIds = ids.slice(0, 2);
  if (ids.length >= 2) assert.deepEqual(bossProblems(ok), []);
  const early = structuredClone(ok);
  const first = checks(early)[0];
  (early.sections[first.si].blocks[first.bi] as Record<string, unknown>).boss = true;
  if (first.si !== last.si) assert.ok(bossProblems(early).length > 0, "kettő / nem az utolsóban");
  assert.deepEqual(bossProblems(withSections(2)), [], "< 3 fejezet: nincs megkötés");
});

test("szójáték-tengely: csak nyelvi leckénél; determinisztikus; mindkettő előfordul; sorozatszabály", () => {
  assert.deepEqual([...WORD_GAMES], ["wordSearch", "crossword"]);
  assert.equal(pickVarietyAxes(1, 4).wordGame, undefined);
  const seen = new Set<string>();
  for (let s = 0; s < 60; s++) { const a = pickVarietyAxes(s, 4, { language: true }); assert.deepEqual(a, pickVarietyAxes(s, 4, { language: true })); seen.add(a.wordGame!); }
  assert.equal(seen.size, 2);
  const picked = { openingForm: "x", ...pickVarietyAxes(2, 4, { language: true }) };
  assert.notEqual(avoidSeriesRepeat(picked, { wordGame: picked.wordGame }, 5).wordGame, picked.wordGame);
});

test("szerződés: boss-sor mindig (BE), szójáték-sor csak kiosztásnál, pontos spec-alakkal", () => {
  const plain = varietyAxesContract(pickVarietyAxes(1, 4), 900);
  assert.match(plain, /BOSS-KÉRDÉS/);
  assert.doesNotMatch(plain, /SZÓJÁTÉK/);
  const lang = varietyAxesContract({ ...pickVarietyAxes(1, 4, { language: true }), wordGame: "crossword" }, 900);
  assert.match(lang, /SZÓJÁTÉK/);
  assert.ok(lang.includes('"tryKind":"crossword"') && lang.includes('"entries"'));
});

test("szójáték-kapu: ≥ 3 fejezetnél a kiosztott szójáték nem első fejezetben kötelező", () => {
  const l = withSections(3);
  assert.ok(wordGameProblems(l, "wordSearch").length > 0);
  const concept = ((l.sections[1].blocks.find((b) => "coversConceptIds" in b) as { coversConceptIds: string[] }).coversConceptIds).slice(0, 1);
  const ok = structuredClone(l);
  ok.sections[1].blocks.push({ kind: "try", tryKind: "wordSearch", spec: { words: ["apple", "pear", "plum"] }, coversConceptIds: concept } as never);
  assert.deepEqual(wordGameProblems(ok, "wordSearch"), []);
  assert.deepEqual(wordGameProblems(l, undefined), []);
});
