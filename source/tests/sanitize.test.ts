import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeHtml, sanitizeText, sanitizeEmail } from "../server/utils/sanitize";

/**
 * server/utils/sanitize.ts — the escaping layer used before user input is embedded in
 * server-rendered HTML (material titles, e-mail bodies) or stored for later display.
 */

// ---------------------------------------------------------------- sanitizeText

test("sanitizeText escapes every HTML-significant character", () => {
  assert.equal(sanitizeText("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;&#x2F;script&gt;");
  assert.equal(sanitizeText(`"quoted"`), "&quot;quoted&quot;");
  assert.equal(sanitizeText("it's"), "it&#x27;s");
  assert.equal(sanitizeText("a & b"), "a &amp; b");
});

test("sanitizeText escapes the ampersand first so escapes are not double-encoded", () => {
  // If & were escaped last, "<" would become "&amp;lt;" instead of "&lt;".
  assert.equal(sanitizeText("<"), "&lt;");
  assert.equal(sanitizeText("&lt;"), "&amp;lt;");
});

test("sanitizeText passes through safe text unchanged", () => {
  assert.equal(sanitizeText("Matematika 5. osztály"), "Matematika 5. osztály");
  assert.equal(sanitizeText("árvíztűrő tükörfúrógép"), "árvíztűrő tükörfúrógép");
});

test("sanitizeText maps nullish and empty input to an empty string", () => {
  assert.equal(sanitizeText(null), "");
  assert.equal(sanitizeText(undefined), "");
  assert.equal(sanitizeText(""), "");
});

test("sanitizeText neutralises an attribute-breakout payload", () => {
  // The result is interpolated into <embed src="/api/pdf/${...}"> in routes.ts.
  const payload = `x" onload="alert(1)`;
  const escaped = sanitizeText(payload);
  assert.ok(!escaped.includes('"'), `quote survived: ${escaped}`);
  assert.ok(!escaped.includes("<"), `angle bracket survived: ${escaped}`);
});

// ---------------------------------------------------------------- sanitizeHtml

test("sanitizeHtml keeps the allowed formatting tags", () => {
  assert.equal(sanitizeHtml("<b>félkövér</b>"), "<b>félkövér</b>");
  assert.equal(sanitizeHtml("<p>egy<br>kettő</p>"), "<p>egy<br>kettő</p>");
  assert.equal(sanitizeHtml('<span class="hl">kiemelt</span>'), '<span class="hl">kiemelt</span>');
});

test("sanitizeHtml strips scripts but keeps their surrounding text", () => {
  const out = sanitizeHtml("előtte<script>alert(1)</script>utána");
  assert.ok(!out.includes("<script"), out);
  assert.ok(!out.includes("alert(1)"), out);
  assert.ok(out.includes("előtte"), out);
  assert.ok(out.includes("utána"), out);
});

test("sanitizeHtml removes event handlers and disallowed tags", () => {
  const out = sanitizeHtml('<img src=x onerror="alert(1)"><b onclick="evil()">szöveg</b>');
  assert.ok(!out.includes("onerror"), out);
  assert.ok(!out.includes("onclick"), out);
  assert.ok(!out.includes("<img"), out);
  assert.ok(out.includes("szöveg"), out);
});

test("sanitizeHtml removes javascript: links", () => {
  const out = sanitizeHtml('<a href="javascript:alert(1)">klikk</a>');
  assert.ok(!out.toLowerCase().includes("javascript:"), out);
});

test("sanitizeHtml maps nullish input to an empty string", () => {
  assert.equal(sanitizeHtml(null), "");
  assert.equal(sanitizeHtml(undefined), "");
  assert.equal(sanitizeHtml(""), "");
});

// --------------------------------------------------------------- sanitizeEmail

test("sanitizeEmail keeps a normal address intact", () => {
  assert.equal(sanitizeEmail("diak@example.com"), "diak@example.com");
  assert.equal(sanitizeEmail("first.last+tag@example.co.uk"), "first.last+tag@example.co.uk");
});

test("sanitizeEmail strips characters that could break out of an HTML attribute", () => {
  assert.equal(sanitizeEmail(`a"b'c<d>e@example.com`), "abcde@example.com");
});

test("sanitizeEmail strips CR/LF so it cannot inject e-mail headers", () => {
  // The value reaches nodemailer/Resend recipient and log lines; a bare CRLF there is a
  // header-injection primitive.
  const injected = "victim@example.com\r\nBcc: attacker@evil.example";
  const cleaned = sanitizeEmail(injected);
  assert.ok(!cleaned.includes("\r"), JSON.stringify(cleaned));
  assert.ok(!cleaned.includes("\n"), JSON.stringify(cleaned));
});

test("sanitizeEmail maps nullish input to an empty string", () => {
  assert.equal(sanitizeEmail(null), "");
  assert.equal(sanitizeEmail(undefined), "");
  assert.equal(sanitizeEmail(""), "");
});
