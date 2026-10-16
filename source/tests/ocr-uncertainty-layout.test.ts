import test from "node:test";
import assert from "node:assert/strict";
import { ROLE_SKILLS } from "../server/studio/role-skills";

/* Spec 2026-10-05-s11 — gyenge kép OCR-je: bizonytalanság és elrendezés (mért: Mezopotámia-füzetfotó, élő futások 2026-10-05). */

test("skill-konvenció: az OCR keretet és sorrendet jelöl, bizonytalan szónál ⟦?⟧ (nem hihető csere); az extract nem értelmezi át", () => {
  assert.match(ROLE_SKILLS.ocr, /\[KERET: <a keret felirata>\]/);
  assert.match(ROLE_SKILLS.ocr, /„1\.”, „2\.”/);
  assert.match(ROLE_SKILLS.ocr, /„⟦\?⟧” jellel/);
  assert.match(ROLE_SKILLS.extract, /„⟦\?⟧” jelű rész BIZONYTALAN olvasat/);
});
