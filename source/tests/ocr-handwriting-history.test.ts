import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OCR_THIRD_READER_MODEL } from "../server/ai/models";
import { keyTokenRecall } from "../server/studio/ocr-recall";

/* Spec 2026-10-05-s11/5 (pótló mérés): 5 valódi kézírásos történelem-füzetlap, 3 olvasó, rögzített nyers átiratokból újraszámolva
   (hálózat nélkül). A forrás-OCR elsődleges olvasója (erős olvasó) a mért mezőny legjobbja kell legyen. */

type Fixture = { pages: Record<string, { keyTokens: string[] }>; transcripts: Record<string, Record<string, string>>; measured: Record<string, number> };
const fx: Fixture = JSON.parse(readFileSync(new URL("./fixtures/ocr-handwriting-history.json", import.meta.url), "utf8"));
const mean = (model: string) => Object.keys(fx.pages).reduce((s, p) => s + keyTokenRecall(fx.transcripts[model][p] ?? "", fx.pages[p].keyTokens).recall, 0) / Object.keys(fx.pages).length;

test("S11/5: a rögzített pontszámok megegyeznek az újraszámolttal", () => {
  for (const [model, expected] of Object.entries(fx.measured)) assert.ok(Math.abs(mean(model) - expected) < 0.005, `${model}: ${expected} vs ${mean(model).toFixed(4)}`);
});

// Spec S11/7 (dokumentált spec-változás): a forrás-OCR eredménye a FÚZIÓ, nem egyetlen olvasó — a régi „egyetlen olvasó a legjobb”
// állítás helyett az S11/7 elfogadási feltétele (lent): fúzió ≥ A-olvasat, ≥ gyenge olvasók, ≥ 95%.
test("S11/5→S11/7: az erős olvasók (sol, opus) a kézírásos lapokon a gyenge olvasók (qwen, glm) fölött, legalább 95%-on", () => {
  for (const strong of [OCR_THIRD_READER_MODEL, "claude-opus-5-5"]) {
    assert.ok(mean(strong) >= 0.95, `${strong}: ${(mean(strong) * 100).toFixed(1)}%`);
    for (const weak of ["qwen/qwen3-vl-32b-instruct", "z-ai/glm-5.3-flash"]) assert.ok(mean(strong) > mean(weak), `${strong} > ${weak}`);
  }
});

/* Spec 2026-10-05-s11/7: a forrás-OCR eredménye a két erős olvasó (A = gpt-6.1-sol high, B = claude-opus-5-5 medium) fúziója. */
type FusionBlock = { readerA: { model: string; effort: string; transcripts: Record<string, string>; measured: number }; transcripts: Record<string, string>; measured: number };
// Review #197: a már beolvasott fixture (egy forrás) — nincs második beolvasás.
const fusion = (fx as Fixture & { fusion?: FusionBlock }).fusion;
const meanOf = (t: Record<string, string>) => Object.keys(fx.pages).reduce((s, p) => s + keyTokenRecall(t[p] ?? "", fx.pages[p].keyTokens).recall, 0) / Object.keys(fx.pages).length;

test("S11/7: a fúzió és az A-olvasata rögzített pontszáma megegyezik az újraszámolttal", () => {
  assert.ok(fusion, "a fúziós mérés a fixture-ben");
  assert.ok(Math.abs(meanOf(fusion.transcripts) - fusion.measured) < 0.005);
  assert.ok(Math.abs(meanOf(fusion.readerA.transcripts) - fusion.readerA.measured) < 0.005);
  assert.equal(`${fusion.readerA.model}:${fusion.readerA.effort}`, "gpt-6.1-sol:high");
  assert.ok(fx.transcripts["claude-opus-5-5"], "a B olvasó (claude-opus-5-5) átiratai a fixture-ben");
});

test("S11/7: a fúzió ≥ a saját A-olvasata, ≥ a gyenge olvasók, ≥ 95%", () => {
  assert.ok(fusion);
  const f = meanOf(fusion.transcripts);
  assert.ok(f >= meanOf(fusion.readerA.transcripts), "a fúzió nem ronthat a saját A-olvasatán");
  for (const weak of ["qwen/qwen3-vl-32b-instruct", "z-ai/glm-5.3-flash"]) assert.ok(f > mean(weak), `fúzió > ${weak}`);
  assert.ok(f >= 0.95);
});
