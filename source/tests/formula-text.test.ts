import { test } from "node:test";
import assert from "node:assert/strict";
import { containsFormula, formulaKey, formulaNormalize, isFormulaText } from "../shared/formula-text";
import { checkGrounding } from "../server/studio/grounding";
import { checkVerbatim } from "../server/studio/verbatim";
import { referenceValueProblems } from "../shared/answer-value";
import { parseInventoryCheck } from "../server/studio/instruction-check";
import { buildInventory, parseInstructionPointCandidates } from "../server/studio/instruction-points";

/* Spec 2026-10-04-kepletbiztos-heurisztikak — a 7 igazolt, leckét blokkolni képes hiba (próbával mérve) és a közös modul határai. */

test("közös modul: határtudatos, előjel-pontos keresés (21 eset)", () => {
  const cases: Array<[string, string, boolean]> = [
    ["Ez az ellentett hozzáadása. −5 − (−8) = −5 + 8 = 3", "-5-(-8)", true],
    ["Példák: −5 − (−8), 9 − (−6) és társaik", "-5-(-8)", true],
    ["Példák: −5 − (−8), 9 − (−6) és társaik", "9-(-6)", true],
    ["Számold: -5-(-8)=-5+8=+3 lépésenként", "-5-(-8)=+3", true],
    ["Számold: -5-(-8)=-5+8=3 lépésenként", "-5-(-8)=+3", true],
    ["Számold: -5-(-8)=-5+8=+31 lépésenként", "-5-(-8)=+3", false],
    ["Számold ki: 5+(+8)! 5+(+8)=+13", "5+(+8)", true],
    ["Számold ki: -5+(+8) eredményét!", "5+(+8)", false],
    ["Számold ki: 1,5+(+8) eredményét!", "5+(+8)", false],
    ["Számold ki: 12-2-8 eredményét!", "-2-8", false],
    ["Számold ki: 1-5+(-8) eredményét!", "-5+(-8)", false],
    ["Számold ki: -2-8+1 eredményét!", "-2-8", false],
    ["Számold ki: -2-8,5 eredményét!", "-2-8", false],
    ["−2 − 8, 5 − 3", "-2-8", true],
    ["Az utolsó feladat: -2-8.", "-2-8", true],
    ["Számold ki a -2-8-at a számegyenesen.", "-2-8", true],
    ["Számold ki: 9-(+6)! A végpont 3.", "9-(-6)", false],
    ["b) 9-(-6)=15", "9-(-6)=15", true],
    ["-5-(-8)=+3   9-(-6)=15", "9-(-6)=15", true],
    ["-5 - (-8) = +3", "-5-(-8)=+3", true],
    ["12:5+(+8)", "5+(+8)", false],
  ];
  for (const [text, formula, want] of cases) assert.equal(containsFormula(text, formula), want, `${formula} @ ${text}`);
});

test("közös modul: sortörés és 2+ szóközös oszloprés határ; a számegyenes-felsorolás és a szám nem képlet", () => {
  assert.equal(containsFormula("-5-(-8)=+3\n-5   -2   0   1   3", "-5-(-8)=+3"), true, "a következő sor nem ragad hozzá");
  assert.equal(containsFormula("-5-(-8)=+3   -2-8=-10", "-5-(-8)=+3"), true, "OCR-oszlop");
  assert.equal(formulaNormalize("9 − (−6) = 15"), "9-(-6)=15");
  assert.equal(formulaKey("-5   -2   0   1   3"), null);
  assert.equal(formulaKey("-3"), null);
  assert.equal(formulaKey("9 − (−6) = 15 ✓."), "9-(-6)=15");
  assert.equal(isFormulaText("x = 5 + 3"), false);
});

test("a 7 igazolt hiba javítva (mért bemenetekkel)", () => {
  const C = (term: string) => ({ localId: "x", term, quote: term, examWeight: "core" as const });
  // 1 — tanári ellenőrzés: a képlet-bizonyíték a fejezetben
  const lesson = { sections: [{ heading: "H", blocks: [{ kind: "explain", text: "Nézzük meg: -5-(-8)=+3 a számegyenesen, mert az ellentettet adjuk hozzá.", coversConceptIds: ["x"] }] }] } as never;
  const inv = buildInventory([[{ text: "Gyakoroltasd a -5-(-8) kivonást", requestSpan: "a -5-(-8) kivonást gyakoroltasd", kind: "teach", sourceQuote: "-5-(-8)=+3", supports: "yes" }]], "Kérlek a -5-(-8) kivonást gyakoroltasd", "-5-(-8)=+3\n9-(-6)=+3");
  assert.equal(parseInventoryCheck({ points: [{ id: inv.points[0].id, taught: true, evidence: "-5-(-8)=+3", section: 0 }] }, lesson, "-5-(-8)=+3", inv).points[0].taught, true);
  // 2 — megalapozottság: mondatvégi pont előtte, egyenlet-lánc
  assert.equal(checkGrounding("Ez az ellentett hozzáadása. −5 − (−8) = −5 + 8 = 3, lépésenként a számegyenesen.", C("-5-(-8)")), true);
  // 3 — rövid ellenőrző blokk
  assert.equal(checkGrounding("-5-(-8) = ___", C("-5-(-8)")), true);
  // 4 — betűhű idézet szóköz-eltéréssel; a hamis érték továbbra sem
  assert.deepEqual(checkVerbatim("-5-(-8)=+3", "Negatív számok\n-5 - (-8) = +3\n9-(-6)=+3"), { ok: true });
  assert.deepEqual(checkVerbatim("-5-(-8)=+13", "Negatív számok\n-5 - (-8) = +3"), { ok: false, reason: "not_found" });
  // 5 — képlet kérés-részlet nem esik ki
  assert.equal(parseInstructionPointCandidates({ points: [{ text: "Gyakoroltasd", requestSpan: "9-(-6)", kind: "teach" }] }, "Tanítsd a 9-(-6) műveletet").length, 1);
  // 6 — címkés forrássor
  assert.equal(buildInventory([[{ text: "P", requestSpan: "a 9-(-6) műveletet", kind: "teach", sourceQuote: "9-(-6)=15", supports: "yes" }]], "Tanítsd a 9-(-6) műveletet", "a) -5-(-8)=+3\nb) 9-(-6)=15").points[0].content, "pending");
  // 7 — zárójelhez tapadó részlánc nem ítélhető; a zárójel nélküli hamis referencia továbbra is hiba
  assert.deepEqual(referenceValueProblems({ id: "t", q: "Mennyi 5-8-(-2)?", typedAnswers: [{ part: "e", kind: "number", value: "-1" }] }), []);
  assert.equal(referenceValueProblems({ id: "t", q: "Mennyi 5-8?", typedAnswers: [{ part: "e", kind: "number", value: "-1" }] }).length, 1);
});

test("review #186: csak a TAPADÓ zárójel; részfeladat-jel és megjegyzés mellett a hamis referencia továbbra is hiba; előjel-pontos kérés-részlet", () => {
  const wrong = (q: string) => referenceValueProblems({ id: "t", q, typedAnswers: [{ part: "e", kind: "number", value: "99" }] }).length;
  assert.equal(wrong("a) 5-8"), 1, "részfeladat-jel");
  assert.equal(wrong("(a) 5-8"), 1);
  assert.equal(wrong("Mennyi 5-8 (indokold)?"), 1, "megjegyzés zárójelben");
  assert.equal(wrong("Az (egész számok között) 5-8 eredménye?"), 1);
  assert.equal(wrong("Mennyi (5-8)·2?"), 0, "zárójeles csoport belseje: nem ítélhető");
  assert.equal(wrong("Mennyi (-2)+5-8?"), 0, "záró zárójel + művelet előtte: részlánc");
  assert.equal(parseInstructionPointCandidates({ points: [{ text: "Gyakoroltasd", requestSpan: "9-(+6)", kind: "teach" }] }, "Tanítsd a 9-(-6) műveletet").length, 0, "előjel-eltérő részlet nem fogadható el");
});
