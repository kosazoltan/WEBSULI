import assert from "node:assert/strict";
import test from "node:test";

import { ocrTextsOf, mergeOcrIntoSourceText } from "../server/studio/ocr";
import { sourceTextOf } from "../server/studio/extractor";
import type { ExtractorFile } from "../server/studio/extractor";

/**
 * #163 — OCR layer for image sources (owner decision: option 2).
 *
 * Root cause it fixes: images carry no searchable text, so every concept from
 * a photo source stayed verbatimOk=false forever and the map could never be
 * approved. A CHEAP vision model transcribes each image once; the transcript
 * joins the searchable source text that the D1 verbatim check runs against.
 */

const IMG: ExtractorFile = { name: "a.jpg", kind: "image", content: "data:image/jpeg;base64,AAAA" };
const TXT: ExtractorFile = { name: "b.txt", kind: "text", content: "A kert egy körbezárt terület." };

test("ocrTextsOf: csak a kép-fajta fájlokat küldi az olcsó modellnek", async () => {
  const calls: string[] = [];
  const fakeOcr = async (file: ExtractorFile) => {
    calls.push(file.name);
    return `OCR-SZÖVEG(${file.name})`;
  };
  const out = await ocrTextsOf([IMG, TXT], fakeOcr);
  assert.deepEqual(calls, ["a.jpg"], "a text fájl nem megy OCR-re");
  assert.deepEqual(out, [{ name: "a.jpg", text: "OCR-SZÖVEG(a.jpg)" }]);
});

test("ocrTextsOf: az OCR-hiba nem dönti be a futást — üres szöveg, megjelölve", async () => {
  const failing = async () => {
    throw new Error("model down");
  };
  const out = await ocrTextsOf([IMG], failing);
  assert.deepEqual(out, [{ name: "a.jpg", text: "" }], "fail-open: a kivonatolás megy tovább, a kép szövege üres");
});

test("mergeOcrIntoSourceText: az OCR-szöveg bekerül a kereshető forrásba", () => {
  const base = sourceTextOf([TXT]);
  const merged = mergeOcrIntoSourceText(base, [{ name: "a.jpg", text: "A parkot mindenki használhatja." }]);
  assert.ok(merged.includes("A kert egy körbezárt terület."), "a szöveges forrás megmarad");
  assert.ok(merged.includes("A parkot mindenki használhatja."), "az OCR-szöveg kereshető");
});

test("mergeOcrIntoSourceText: üres OCR nem ad zajt", () => {
  const merged = mergeOcrIntoSourceText("alap", [{ name: "a.jpg", text: "" }]);
  assert.equal(merged, "alap");
});
