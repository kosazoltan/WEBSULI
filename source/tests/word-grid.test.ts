import test from "node:test";
import assert from "node:assert/strict";
import { buildWordSearch, buildCrossword, scoreWordSearch, scoreCrossword, readWordInGrid } from "../shared/word-grid";
import { trySpecProblems } from "../shared/try-scoring";
import { lessonSchema, TRY_KINDS } from "../shared/lesson-schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V5a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): szókereső és keresztrejtvény — determinisztikus rácsgenerátor. */
const WORDS = ["alma", "körte", "szilva", "barack", "meggy"];

test("szókereső: azonos bemenet → azonos rács; minden szó a rácsban olvasható a megadott helyen", () => {
  const a = buildWordSearch(WORDS), b = buildWordSearch([...WORDS]);
  assert.deepEqual(a, b);
  assert.ok(a.size >= 6 && a.size <= 14);
  assert.equal(a.placements.length, WORDS.length);
  for (const p of a.placements) assert.equal(readWordInGrid(a.grid, p), p.word.toLocaleUpperCase("hu"));
  for (const row of a.grid) for (const ch of row) assert.match(ch, /^\p{Lu}$/u);
  assert.notDeepEqual(buildWordSearch(["alma", "körte", "szilva"]).grid, a.grid);
});

test("keresztrejtvény: determinisztikus; minden bejegyzés olvasható; a keresztezések betűi egyeznek; van keresztezés", () => {
  const entries = [{ answer: "alma", clue: "Piros vagy zöld gyümölcs" }, { answer: "barack", clue: "Bolyhos héjú gyümölcs" }, { answer: "meggy", clue: "Savanyú cseresznyeféle" }, { answer: "dinnye", clue: "Nyári, nagy gyümölcs" }];
  const c = buildCrossword(entries);
  assert.deepEqual(c, buildCrossword(entries.map((e) => ({ ...e }))));
  assert.equal(c.placements.length, entries.length);
  const cells = new Map<string, string>();
  for (const p of c.placements) {
    const word = p.answer.toLocaleUpperCase("hu");
    [...word].forEach((ch, i) => {
      const key = p.dir === "across" ? `${p.row},${p.col + i}` : `${p.row + i},${p.col}`;
      if (cells.has(key)) assert.equal(cells.get(key), ch, `ütközés: ${key}`);
      cells.set(key, ch);
    });
  }
  const total = c.placements.reduce((n, p) => n + [...p.answer].length, 0);
  assert.ok(cells.size < total, "legalább egy keresztezés");
});

test("pontozás: szókereső — megtalált szavak; keresztrejtvény — helyes bejegyzések (kis- / nagybetű nem számít, az ékezet igen)", () => {
  const ws = { words: WORDS };
  assert.deepEqual(scoreWordSearch(ws, WORDS), { points: 5, max: 5, verdict: "teljes" });
  assert.deepEqual(scoreWordSearch(ws, ["alma", "nincs"]), { points: 1, max: 5, verdict: "részleges" });
  assert.deepEqual(scoreWordSearch(ws, []), { points: 0, max: 5, verdict: "rossz" });
  const cw = { entries: [{ answer: "körte", clue: "a" }, { answer: "alma", clue: "b" }, { answer: "meggy", clue: "c" }] };
  assert.deepEqual(scoreCrossword(cw, ["KÖRTE", "alma", "megy"]), { points: 2, max: 3, verdict: "részleges" });
  assert.deepEqual(scoreCrossword(cw, ["korte", "", ""]), { points: 0, max: 3, verdict: "rossz" });
});

test("séma: helyes / hibás szókereső és keresztrejtvény", () => {
  for (const k of ["wordSearch", "crossword"]) assert.ok((TRY_KINDS as readonly string[]).includes(k), k);
  assert.deepEqual(trySpecProblems("wordSearch", { words: WORDS }), []);
  assert.ok(trySpecProblems("wordSearch", { words: ["ab", "x"] }).length > 0);
  assert.ok(trySpecProblems("wordSearch", { words: ["alma", "alma", "körte"] }).length > 0, "ismétlődő szó");
  assert.deepEqual(trySpecProblems("crossword", { entries: [{ answer: "alma", clue: "a" }, { answer: "körte", clue: "b" }, { answer: "meggy", clue: "c" }] }), []);
  assert.ok(trySpecProblems("crossword", { entries: [{ answer: "két szó", clue: "a" }, { answer: "körte", clue: "b" }, { answer: "meggy", clue: "c" }] }).length > 0, "szóköz a megfejtésben");
  const l = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<Record<string, unknown>> }> };
  const concept = (l.sections[0].blocks.find((b) => Array.isArray(b.coversConceptIds))!.coversConceptIds as string[]).slice(0, 1);
  l.sections[0].blocks.push({ kind: "try", tryKind: "wordSearch", spec: { words: WORDS }, coversConceptIds: concept });
  assert.equal(lessonSchema.safeParse(l).success, true);
});
