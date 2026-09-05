import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContinuationMessages,
  joinContinuation,
  stripHtmlCodeFence,
  MAX_CONTINUATION_ROUNDS,
} from "../server/improve/continuation";

/**
 * #171 — az okosító csonka kimenetének gyökér-oka: a 32k max_tokens plafonnál
 * a stream szabályosan lezár ('done'), a kód sikeresnek hiszi, a verify-kapu
 * pedig jogosan elutasítja. Folytatásos generálás: a részleges kimenet
 * assistant-üzenetként visszamegy, a modell PONTOSAN onnan folytatja.
 */

test("buildContinuationMessages: a részleges kimenet assistant-ként megy vissza, a folytatás-parancs egyértelmű", () => {
  const msgs = buildContinuationMessages("SYS", "USER", "<html><body>fél");
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[0].content, "SYS");
  assert.equal(msgs[1].role, "user");
  assert.equal(msgs[1].content, "USER");
  assert.equal(msgs[2].role, "assistant");
  assert.equal(msgs[2].content, "<html><body>fél");
  assert.equal(msgs[3].role, "user");
  assert.ok(msgs[3].content.includes("PONTOSAN ott folytasd"), "a parancs a folytatásra utasít");
  assert.ok(msgs[3].content.includes("ne ismételj"), "ismétlés tiltva");
});

test("joinContinuation: sima illesztés + kódblokk-kerítés levágása a folytatásról", () => {
  assert.equal(joinContinuation("<p>a", "b</p>"), "<p>ab</p>");
  assert.equal(joinContinuation("<p>a", "```html\nb</p>\n```"), "<p>ab</p>");
});

test("joinContinuation: ha a folytatás átfedéssel ismétli a véget, az átfedés egyszer szerepel", () => {
  const partial = "<div>alpha beta gamma";
  const continuation = "beta gamma delta</div>";
  assert.equal(joinContinuation(partial, continuation), "<div>alpha beta gamma delta</div>");
});

test("stripHtmlCodeFence: kerítés nélkül változatlan, kerítéssel a belseje", () => {
  assert.equal(stripHtmlCodeFence("<html></html>"), "<html></html>");
  assert.equal(stripHtmlCodeFence("```html\n<html></html>\n```"), "<html></html>");
});

test("MAX_CONTINUATION_ROUNDS: korlátos (2-5), nem végtelen hurok", () => {
  assert.ok(MAX_CONTINUATION_ROUNDS >= 2 && MAX_CONTINUATION_ROUNDS <= 5);
});
