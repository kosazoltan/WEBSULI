import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConceptFixPrompt,
  checkConceptFixResult,
  D1_RULE_TEXT,
} from "../server/studio/step-io";
import type { Lesson } from "../shared/lesson-schema";
import type { MapConcept } from "../server/studio/coverage";

/**
 * LS-5 — "fix this concept" (master plan §5).
 *
 * The Studio re-runs the author on ONE weak concept. The contract mirrors the
 * animator's: only blocks whose coversConceptIds contain the target concept may
 * change; every other block stays byte-identical; no new concept id may appear.
 * A "fix" that rewrites the lesson is how a review feedback loop quietly
 * rewrites curriculum.
 */

const MAP: MapConcept[] = [{ localId: "c1", examWeight: "core" }];

function lesson(concepts: string[]): Lesson {
  return {
    title: "A sejt",
    subject: "biológia",
    classroom: 7,
    mapId: "m1",
    sourceOnly: true,
    misconceptions: [],
    sections: [
      {
        heading: "A sejt",
        probaEnabled: true,
        blocks: [
          {
            kind: "explain",
            text: "A sejt az élőlények alapegysége.",
            depth: "core",
            readAloud: true,
            coversConceptIds: concepts,
          },
        ],
      },
    ],
  };
}

test("fixConcept: a célfogalom blokkja módosulhat", () => {
  const original = lesson(["c1"]);
  const candidate = lesson(["c1"]);
  candidate.sections[0].blocks[0] = { ...candidate.sections[0].blocks[0], text: "Javított szöveg." };
  const out = checkConceptFixResult(original, candidate, "c1");
  assert.equal(out.ok, true);
});

test("fixConcept: MÁS fogalom blokkja nem változhat", () => {
  const original = lesson(["c2"]);
  const candidate = lesson(["c2"]);
  candidate.sections[0].blocks[0] = { ...candidate.sections[0].blocks[0], text: "Átírva." };
  const out = checkConceptFixResult(original, candidate, "c1");
  assert.equal(out.ok, false);
  assert.match(out.reasons.join("; "), /c2/i, "a sértő fogalom megnevezve");
});

test("fixConcept: kitalált fogalom-id soha nem jelenhet meg", () => {
  const original = lesson(["c1"]);
  const candidate = lesson(["c1", "kitalalt"]);
  const out = checkConceptFixResult(original, candidate, "c1");
  assert.equal(out.ok, false);
  assert.match(out.reasons.join("; "), /kitalalt/);
});

test("fixConcept: az azonosító mezők érintetlenek", () => {
  const original = lesson(["c1"]);
  const candidate = { ...lesson(["c1"]), title: "Más cím" };
  const out = checkConceptFixResult(original, candidate, "c1");
  assert.equal(out.ok, false);
});

test("buildConceptFixPrompt: D1 szó szerint, a célfogalom és a szigor kimondva", () => {
  const prompt = buildConceptFixPrompt(lesson(["c1"]), { subject: "biológia", classroom: 7, concepts: MAP }, "c1");
  assert.ok(prompt.includes(D1_RULE_TEXT), "a D1 szabály szó szerint a fix-promptban is kötelező");
  assert.ok(prompt.includes("c1"), "a célfogalom megnevezve");
  assert.ok(/ONLY.*coversConceptIds.*c1/i.test(prompt) || prompt.includes("csak"), "a hatókör: csak a célfogalom blokkjai");
});
