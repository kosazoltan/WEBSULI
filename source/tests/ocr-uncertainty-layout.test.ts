import test from "node:test";
import assert from "node:assert/strict";
import { markUnresolvedDisputes, ocrDisagreements, UNCERTAIN_MARK, dualReadOcr } from "../server/studio/ocr";
import { autoReviewDecision } from "../server/studio/auto-approve";
import { hasTranscriptMarks, stripTranscriptMarks } from "../shared/transcript-marks";
import { ROLE_SKILLS } from "../server/studio/role-skills";
import type { ExtractorFile } from "../server/studio/extractor";

/* Spec 2026-10-05-s11 — gyenge kép OCR-je: bizonytalanság és elrendezés (mért: Mezopotámia-füzetfotó, élő futások 2026-10-05). */

test("érdemi eltérés (> 2 szerkesztés) a döntő átiratban ⟦?⟧ jelet kap; a betűnyi eltérés nem", () => {
  const first = "Mezopotámia: folyóköz\nKesia, Föld - Felt. térsége\nParasztok és bézművesek";
  const second = "Mezopotámia: folyóköz\nÁzsia, Közel-Kelet térsége\nParasztok és kézművesek";
  const disputes = ocrDisagreements(first, second);
  const decided = "Mezopotámia: folyóköz\nKesia, Föld - Felt. térsége\nParasztok és kézművesek";
  const marked = markUnresolvedDisputes(decided, disputes);
  assert.match(marked, new RegExp(`Kesia, Föld - Felt\\.${UNCERTAIN_MARK.replace(/[?]/g, "\\?")}`), "a mért hibás sor jelölve");
  assert.doesNotMatch(marked, /kézművesek⟦\?⟧/, "a betűnyi (bézművesek/kézművesek) eltérés nem bizonytalan");
  assert.equal(markUnresolvedDisputes(marked, disputes), marked, "idempotens");
});

test("a kettős olvasás sikeres döntése után a jelölés az átiratban marad", async () => {
  const file = { name: "fuzet.jpg", kind: "image", content: "data:image/jpeg;base64,AA" } as ExtractorFile;
  const ocr = dualReadOcr(async () => "Kesia, Föld - Felt. térsége", async () => "Ázsia, Közel-Kelet térsége", async (_f, first) => first);
  assert.match(await ocr(file), /⟦\?⟧/);
});

test("bizonytalan olvasatra épülő fogalom nem tény (pending) — súlytól függetlenül", () => {
  assert.equal(autoReviewDecision({ examWeight: "supporting", verbatimOk: true, uncertainQuote: true }), "pending");
  assert.equal(autoReviewDecision({ examWeight: "core", verbatimOk: true, uncertainQuote: true }), "pending");
  assert.equal(autoReviewDecision({ examWeight: "core", verbatimOk: true }), "kept", "jelölés nélkül a régi viselkedés");
});

test("a jelölők a gyereknek szóló leckébe nem kerülhetnek; a jelölő nélküli mező bájtra azonos", () => {
  const lesson = { title: "Mezopotámia", sections: [{ text: "[KERET: társadalom] 1. élén: papkirályok ⟦?⟧ [KERET VÉGE]" }], untouched: "  szóközös  szöveg " };
  assert.ok(hasTranscriptMarks(JSON.stringify(lesson)));
  const clean = stripTranscriptMarks(lesson);
  assert.equal(clean.sections[0].text, "1. élén: papkirályok");
  assert.equal(clean.untouched, "  szóközös  szöveg ");
  assert.equal(hasTranscriptMarks(JSON.stringify(clean)), false);
});

test("skill-konvenció: az OCR keretet és sorrendet jelöl, bizonytalan szónál ⟦?⟧ (nem hihető csere); az extract nem értelmezi át", () => {
  assert.match(ROLE_SKILLS.ocr, /\[KERET: <a keret felirata>\]/);
  assert.match(ROLE_SKILLS.ocr, /„1\.”, „2\.”/);
  assert.match(ROLE_SKILLS.ocr, /„⟦\?⟧” jellel/);
  assert.match(ROLE_SKILLS.extract, /„⟦\?⟧” jelű rész BIZONYTALAN olvasat/);
});
