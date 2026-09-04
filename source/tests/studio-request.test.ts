import assert from "node:assert/strict";
import test from "node:test";

import { buildConceptUpdate, parseExtractRequest } from "../server/studio/request";

/**
 * LS-1 — what the Studio endpoints accept, and what they refuse to take on trust.
 *
 * The rule these tests encode: the browser may propose wording, but it may never
 * declare a concept source-faithful. `verbatimOk` is derived server-side from the
 * stored source text, so a hand-crafted request cannot smuggle an invented claim
 * into an approvable map (D1).
 */

const SOURCE = "A fotoszintézis a kloroplasztiszban zajlik.";

test("parseExtractRequest accepts a well-formed upload", () => {
  const r = parseExtractRequest({
    scope: { subject: "biológia", classroom: 7 },
    files: [{ name: "bio.pdf", kind: "pdf", content: "..." }],
  });
  assert.equal(r.ok, true);
});

test("parseExtractRequest refuses an upload with no files", () => {
  const r = parseExtractRequest({
    scope: { subject: "biológia", classroom: 7 },
    files: [],
  });
  assert.equal(r.ok, false);
});

test("parseExtractRequest refuses a classroom outside 0-12", () => {
  for (const classroom of [-1, 13, 7.5]) {
    const r = parseExtractRequest({
      scope: { subject: "biológia", classroom },
      files: [{ name: "b.pdf", kind: "pdf", content: "x" }],
    });
    assert.equal(r.ok, false, `classroom ${classroom} must be rejected`);
  }
});

test("parseExtractRequest refuses an unknown file kind", () => {
  const r = parseExtractRequest({
    scope: { subject: "biológia", classroom: 7 },
    files: [{ name: "b.mp4", kind: "video", content: "x" }],
  });
  assert.equal(r.ok, false);
});

test("buildConceptUpdate re-derives verbatimOk when the quote changes", () => {
  const update = buildConceptUpdate({ quote: "A fotoszintézis a kloroplasztiszban zajlik." }, SOURCE);
  assert.equal(update.verbatimOk, true);
  assert.equal(update.verbatimReason, null);
});

test("buildConceptUpdate marks an edited-in invented quote as not verbatim", () => {
  const update = buildConceptUpdate({ quote: "A fotoszintézis a Holdon zajlik." }, SOURCE);
  assert.equal(update.verbatimOk, false);
  assert.equal(update.verbatimReason, "not_found");
});

test("buildConceptUpdate IGNORES a client-supplied verbatimOk (no self-certifying)", () => {
  // The dangerous request: "trust me, this is in the book".
  const update = buildConceptUpdate(
    { quote: "A fotoszintézis a Holdon zajlik.", verbatimOk: true } as Record<string, unknown>,
    SOURCE,
  );
  assert.equal(update.verbatimOk, false, "the server must decide, not the client");
});

test("buildConceptUpdate leaves verbatim state alone when the quote is untouched", () => {
  // Renaming a term must not silently re-open or re-bless the source check.
  const update = buildConceptUpdate({ term: "fotoszintézis" }, SOURCE);
  assert.equal("verbatimOk" in update, false);
  assert.equal(update.term, "fotoszintézis");
});

test("buildConceptUpdate always stamps updatedAt", () => {
  const update = buildConceptUpdate({ term: "x" }, SOURCE);
  assert.ok(update.updatedAt instanceof Date);
});
