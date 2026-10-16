import test from "node:test";
import assert from "node:assert/strict";
import { ROLE_SKILLS } from "../server/studio/role-skills";

/* Spec 2026-10-05-s11/5 (tulajdonosi döntés a 8. élő futás után): a studió forrás-OCR-jében az erős olvasó olvas elsőként és dönt
   vitában; a konfigurált (mért) OCR-modell a független második; harmadik szavazó nincs. A konfigurált OCR-modell nem változik. */

test("S11/5: az OCR-skill nem írja át a lap márka-/gyártó-feliratát", () => {
  assert.match(ROLE_SKILLS.ocr, /márka-, gyártó- vagy füzetcég-felirat/);
});
