import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnimatorPrompt,
  checkAnimatorResult,
  D1_RULE_TEXT,
} from "../server/studio/step-io";
import type { Lesson } from "../shared/lesson-schema";
import type { MapConcept } from "../server/studio/coverage";

/**
 * LS-4 — the animator's invariants (master plan §4).
 *
 * The animator is a paid model call, and a model that rewrites a lesson while
 * "animating" it is how fabricated claims slip past D1. The contract is therefore
 * structural, not stylistic: the candidate may only add or replace `animate`
 * blocks; every non-animate block must survive byte-identical; no new concept id
 * may appear; the identity fields stay untouched. These tests pin the pure
 * checker before the runner exists.
 */

const MAP: MapConcept[] = [{ localId: "c1", examWeight: "core" }];

function lessonWithBlocks(blocks: Lesson["sections"][0]["blocks"]): Lesson {
  return {
    title: "A sejt",
    subject: "biológia",
    classroom: 7,
    mapId: "m1",
    sections: [{ heading: "A sejt", probaEnabled: true, blocks }],
    misconceptions: [],
    sourceOnly: true,
  };
}

const EXPLAIN = {
  kind: "explain",
  text: "A sejt az élőlények alapegysége.",
  depth: "core",
  readAloud: true,
  coversConceptIds: ["c1"],
} as const;

const CHECK = {
  kind: "check",
  question: "Mi a sejt?",
  options: ["Sejt", "Kő", "Nap"],
  correctIndex: 0,
  feedbackPerOption: ["Igen.", "Nem.", "Nem."],
  coversConceptIds: ["c1"],
} as const;

const ANIMATE = {
  kind: "animate",
  animKind: "numberLine",
  params: { from: 0, to: 10 },
  caption: "Számegyenes",
  coversConceptIds: ["c1"],
} as const;

test("invariánsok: a változatlan lecke átmegy", () => {
  const lesson = lessonWithBlocks([EXPLAIN, ANIMATE]);
  const out = checkAnimatorResult(lesson, lesson);
  assert.equal(out.ok, true);
  assert.deepEqual(out.reasons, []);
});

test("invariánsok: a módosított nem-animate blokk elutasítás", () => {
  const original = lessonWithBlocks([EXPLAIN, CHECK]);
  const candidate = lessonWithBlocks([
    { ...EXPLAIN, text: "A sejt NEM az élőlények alapegysége. (a gép átírta)" },
    CHECK,
  ]);

  const out = checkAnimatorResult(original, candidate);
  assert.equal(out.ok, false);
  assert.match(out.reasons.join("; "), /nem-animate/i, "a nem-animate blokk érintetlen maradhat csak");
});

test("invariánsok: kitalált fogalom-azonosító elutasítás, megnevezve", () => {
  const original = lessonWithBlocks([EXPLAIN]);
  const candidate = lessonWithBlocks([
    EXPLAIN,
    { ...ANIMATE, coversConceptIds: ["c1", "kitalalt-id"] },
  ]);

  const out = checkAnimatorResult(original, candidate);
  assert.equal(out.ok, false);
  assert.match(out.reasons.join("; "), /kitalalt-id/);
});

test("invariánsok: eltűnt nem-animate blokk elutasítás", () => {
  const original = lessonWithBlocks([EXPLAIN, CHECK]);
  const candidate = lessonWithBlocks([EXPLAIN]);

  const out = checkAnimatorResult(original, candidate);
  assert.equal(out.ok, false);
});

test("invariánsok: új animate blokk létező id-val átmegy", () => {
  const original = lessonWithBlocks([EXPLAIN]);
  const candidate = lessonWithBlocks([EXPLAIN, ANIMATE]);

  const out = checkAnimatorResult(original, candidate);
  assert.equal(out.ok, true);
});

test("invariánsok: animate blokk cseréje átmegy", () => {
  const original = lessonWithBlocks([EXPLAIN, ANIMATE]);
  const candidate = lessonWithBlocks([
    EXPLAIN,
    { ...ANIMATE, animKind: "fraction", caption: "Törtek" },
  ]);

  const out = checkAnimatorResult(original, candidate);
  assert.equal(out.ok, true);
});

test("invariánsok: az átcímzett lecke elutasítás", () => {
  const original = lessonWithBlocks([EXPLAIN]);
  const candidate = { ...original, title: "Más cím" };

  const out = checkAnimatorResult(original, candidate);
  assert.equal(out.ok, false);
});

test("buildAnimatorPrompt: D1 szó szerint, a blokkoló szabályok és az id-k benne", () => {
  const lesson = lessonWithBlocks([EXPLAIN]);
  const prompt = buildAnimatorPrompt(lesson, { subject: "biológia", classroom: 7, concepts: MAP });

  assert.ok(prompt.includes(D1_RULE_TEXT), "a D1 szabály szó szerint az animator promptjában is kötelező");
  assert.ok(prompt.includes("c1"), "a lecke fogalom-id-je visszhangozva");
  assert.ok(/ONLY (add|touch|modify|replace).*`animate` blocks/i.test(prompt), "a szerződés: csak animate blokkokhoz nyúlhat");
  assert.ok(prompt.includes("byte-identical"), "a nem-animate blokkok bájtra azonos maradását kimondja");
});
