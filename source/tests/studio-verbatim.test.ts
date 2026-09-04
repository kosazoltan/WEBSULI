import assert from "node:assert/strict";
import test from "node:test";

import { checkVerbatim, normalizeForCompare } from "../server/studio/verbatim";

/**
 * LS-1 / D1 — the source always wins.
 *
 * A model that cannot quote the textbook may not make the claim. This guard is the
 * mechanical form of that rule: the concept's `quote` must really occur in the text
 * extracted from the uploaded files.
 *
 * It must tolerate the noise that OCR and PDF extraction genuinely produce (line
 * wraps, doubled spaces, curly vs straight quotes, en-dash vs hyphen, soft hyphens)
 * while still refusing a sentence the source does not contain. Being too strict
 * would make the guard useless (everything red); being too loose would let an
 * invented claim through.
 */

const SOURCE = `A fotoszintézis során a növény a fény energiáját használja fel.
A folyamat a kloroplasztiszban zajlik – ez a zöld színtest.
A „termelő" szervezetek maguk állítják elő a tápanyagot.`;

test("accepts a quote copied straight from the source", () => {
  const r = checkVerbatim("A folyamat a kloroplasztiszban zajlik", SOURCE);
  assert.equal(r.ok, true);
});

test("rejects a claim the source never makes", () => {
  // Plausible, textbook-sounding, and absent — exactly the hallucination we block.
  const r = checkVerbatim(
    "A fotoszintézis éjszaka a mitokondriumban zajlik.",
    SOURCE,
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not_found");
});

test("rejects an empty or whitespace-only quote", () => {
  assert.equal(checkVerbatim("", SOURCE).ok, false);
  assert.equal(checkVerbatim("   \n ", SOURCE).ok, false);
  assert.equal(checkVerbatim("   ", SOURCE).reason, "empty");
});

test("rejects a quote when the source text itself is empty", () => {
  const r = checkVerbatim("bármi", "");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no_source");
});

test("survives line wraps and doubled whitespace from PDF extraction", () => {
  const wrapped = "A fotoszintézis   során a növény\n  a fény energiáját";
  assert.equal(checkVerbatim(wrapped, SOURCE).ok, true);
});

test("treats Hungarian curly quotes and straight quotes as the same character", () => {
  assert.equal(checkVerbatim('a "termelő" szervezetek', SOURCE).ok, true);
});

test("treats en-dash, em-dash and hyphen as the same separator", () => {
  assert.equal(checkVerbatim("zajlik - ez a zöld színtest", SOURCE).ok, true);
  assert.equal(checkVerbatim("zajlik — ez a zöld színtest", SOURCE).ok, true);
});

test("ignores case differences", () => {
  assert.equal(checkVerbatim("A FOTOSZINTÉZIS SORÁN", SOURCE).ok, true);
});

test("strips soft hyphens introduced by hyphenated line breaks", () => {
  assert.equal(checkVerbatim("kloroplasz\u00ADtiszban", SOURCE).ok, true);
});

test("does not accept a quote that merely shares words with the source", () => {
  // Same vocabulary, different claim — a bag-of-words check would wrongly pass this.
  const r = checkVerbatim("A növény a zöld színtest energiáját termeli.", SOURCE);
  assert.equal(r.ok, false);
});

test("rejects a reordered sentence built ONLY from words present in the source", () => {
  // Every single word below occurs in SOURCE, but the sentence does not: this is the
  // exact shape of a model-invented claim assembled from textbook vocabulary.
  // A substring check catches it; a bag-of-words check does not. Reverse-mutation
  // (2026-09-04) proved this case is what makes the guard real.
  const scrambled = "a növény a fény energiáját a kloroplasztiszban használja fel";
  for (const word of scrambled.split(" ")) {
    assert.ok(
      normalizeForCompare(SOURCE).includes(word),
      `precondition: "${word}" must occur in the source`,
    );
  }
  assert.equal(checkVerbatim(scrambled, SOURCE).ok, false);
});

test("rejects a quote whose words appear only in separate sentences", () => {
  // "termelő" and "kloroplasztiszban" are in different sentences of SOURCE.
  const spliced = "a termelő szervezetek a kloroplasztiszban";
  assert.equal(checkVerbatim(spliced, SOURCE).ok, false);
});

test("normalizeForCompare is idempotent", () => {
  const once = normalizeForCompare(SOURCE);
  assert.equal(normalizeForCompare(once), once);
});
