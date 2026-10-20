import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runInNewContext } from "node:vm";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import { LESSON_HTML_SPEC_V74 } from "../server/ai/lesson-html-spec";
import type { OpenTask } from "../shared/lesson-experience";

/*
 * Spec 2026-10-20-r5-pontozo-korpusz: a pontozó regressziós korpusza (tests/fixtures/scorer-corpus.json) — a héten élesben talált
 * buktatók (angol tagadás, hamis tagadás, ragozás, rövid szó, szám, összevonás). Minden pontozóváltozás ezen fut: a megosztott (v1)
 * pontozó és a HTML-referencia (ee_evaluate) is pontosan az elvárt pontot adja, és minden minta a saját rubrikáján 1 pont.
 */

type Case = { name: string; source: string; task: Pick<OpenTask, "required" | "minWords" | "needsSentence" | "sample">; answer: string; expected: number; knownGap?: boolean; desired?: number };
const corpus = JSON.parse(fs.readFileSync("tests/fixtures/scorer-corpus.json", "utf8")) as { cases: Case[] };
const base = { id: "t", sectionIndex: 0, coversConceptIds: ["c"], q: "q", bonus: [], mode: "written" } as unknown as OpenTask;

function eeEvaluate(): typeof evaluateOpenAnswer {
  const begin = LESSON_HTML_SPEC_V74.indexOf("function ee_norm(s)");
  const end = LESSON_HTML_SPEC_V74.indexOf("```", begin);
  const context: Record<string, unknown> = {};
  runInNewContext(LESSON_HTML_SPEC_V74.slice(begin, end), context, { timeout: 1000 });
  return context.ee_evaluate as typeof evaluateOpenAnswer;
}

test("a korpusz nem üres, és minden esetnek van forrása", () => {
  assert.ok(corpus.cases.length >= 20);
  for (const c of corpus.cases) assert.ok(c.source && c.name, JSON.stringify(c));
  // Az ismert korlát jelölt: a kívánt pont eltér a jelenlegitől (különben nem korlát, hanem rendes eset).
  for (const c of corpus.cases.filter((x) => x.knownGap)) assert.ok(typeof c.desired === "number" && c.desired !== c.expected, c.name);
});

for (const [label, score] of [["v1 (megosztott)", evaluateOpenAnswer], ["HTML-referencia (ee_evaluate)", eeEvaluate()]] as const) {
  test(`pontozó-korpusz — ${label}: minden minta 1 pont, minden válasz az elvárt pont`, () => {
    const failures: string[] = [];
    for (const c of corpus.cases) {
      const task = { ...base, ...c.task } as OpenTask;
      const sample = score(task.sample, task).score;
      const answer = score(c.answer, task).score;
      if (sample !== 1) failures.push(`${c.name}: a minta ${sample} pont (1 kell)`);
      if (answer !== c.expected) failures.push(`${c.name}: „${c.answer}” → ${answer} (elvárt ${c.expected})`);
    }
    assert.deepEqual(failures, []);
  });
}
