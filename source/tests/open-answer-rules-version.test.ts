import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { OPEN_ANSWER_RULES_HU, OPEN_ANSWER_RULES_VERSION, SHORT_COMPLETE_SCORE, evaluateOpenAnswer } from "../shared/lesson-experience-score";

/** S7a (docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md): a nyílt válasz szabályszövegének verziója és lenyomata. */

// A verzió és a lenyomat EGYÜTT változik: új szabályszöveg = új verzió + új lenyomat ebben a párban.
const FINGERPRINTS: Record<string, string> = { "open-answer-2": "__FP__" };

test("S7a: a szabályverzió open-answer-2, a lenyomat a rögzített érték", () => {
  assert.equal(OPEN_ANSWER_RULES_VERSION, "open-answer-2");
  const fp = createHash("sha256").update(OPEN_ANSWER_RULES_HU).digest("hex").slice(0, 12);
  assert.equal(fp, FINGERPRINTS[OPEN_ANSWER_RULES_VERSION], "a szabályszöveg változott — emeld az OPEN_ANSWER_RULES_VERSION-t és frissítsd a lenyomatot");
});

test("S7a: a szabályszöveg fél pontja a pontozó állandója, és a pontozó tényleg ennyit ad a tömör, teljes válaszra", () => {
  assert.equal(SHORT_COMPLETE_SCORE, 0.5);
  assert.ok(OPEN_ANSWER_RULES_HU.includes(`${String(SHORT_COMPLETE_SCORE).replace(".", ",")} (tömör válasz)`));
  const task = { id: "t", sectionIndex: 0, coversConceptIds: ["c"], q: "Mi a fotoszintézis terméke?", required: [["oxigén"], ["cukor", "glükóz"]], bonus: [], minWords: 8, needsSentence: false, sample: "A fotoszintézis során a növény oxigént és cukrot állít elő.", mode: "written" } as unknown as Parameters<typeof evaluateOpenAnswer>[1];
  assert.equal(evaluateOpenAnswer("oxigén, cukor", task).score, SHORT_COMPLETE_SCORE);
});
