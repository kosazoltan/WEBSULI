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

test("S11/5: a forrás-OCR elsődleges (erős) olvasója a kézírásos történelem-lapokon a mért mezőny legjobbja", () => {
  const ranked = Object.keys(fx.transcripts).sort((a, b) => mean(b) - mean(a));
  assert.equal(ranked[0], OCR_THIRD_READER_MODEL, ranked.map((m) => `${m}=${(mean(m) * 100).toFixed(1)}%`).join(", "));
  assert.ok(mean(OCR_THIRD_READER_MODEL) >= 0.95, "a mért ≥ 95% (a #190 célja) nem csúszhat vissza");
});
