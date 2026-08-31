import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  escapeHtml,
  sanitizeForEmail,
  generateFingerprint,
  determineSeverity,
  buildErrorEmailHtml,
} from "../server/lib/error-sanitize";

/**
 * server/lib/error-sanitize.ts — the pure helpers behind the Universal Error Logger.
 *
 * These matter because every field they touch is attacker-influenced: an anonymous client
 * can POST to /api/error-report, and the result is rendered as HTML in the admin's inbox.
 */

// ------------------------------------------------------------------ escapeHtml

test("escapeHtml neutralises a script payload", () => {
  assert.equal(
    escapeHtml("<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  );
});

test("escapeHtml escapes both quote styles", () => {
  // Single quotes matter: the e-mail template also uses them around attribute values.
  assert.equal(escapeHtml(`"double"`), "&quot;double&quot;");
  assert.equal(escapeHtml(`'single'`), "&#x27;single&#x27;");
});

test("escapeHtml escapes the ampersand first", () => {
  assert.equal(escapeHtml("<"), "&lt;");
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
});

test("escapeHtml maps nullish input to an empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("escapeHtml defuses a payload that fits the 20-char environment field", () => {
  // error-report.ts caps `environment` at 20 characters — long enough for <svg onload=x>.
  const payload = "<svg onload=alert()>";
  assert.equal(payload.length, 20);
  const out = escapeHtml(payload);
  assert.ok(!out.includes("<"), out);
  assert.ok(!out.includes(">"), out);
});

// ------------------------------------------------------------- sanitizeForEmail

test("sanitizeForEmail redacts a credential written with an equals sign", () => {
  assert.ok(!sanitizeForEmail("password=hunter2").includes("hunter2"));
  assert.ok(!sanitizeForEmail("token=abc123").includes("abc123"));
});

test("sanitizeForEmail redacts a credential written with a colon and a space", () => {
  // The value sits after whitespace; a regex anchored on [^\s]* stops before it.
  assert.ok(!sanitizeForEmail("password: hunter2").includes("hunter2"));
  assert.ok(!sanitizeForEmail("Secret: s3cr3t-value").includes("s3cr3t-value"));
  assert.ok(!sanitizeForEmail("api_key: sk-live-abcdef").includes("sk-live-abcdef"));
});

test("sanitizeForEmail redacts an Authorization header line", () => {
  const out = sanitizeForEmail("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig");
  assert.ok(!out.includes("eyJhbGciOiJIUzI1NiJ9"), out);
});

test("sanitizeForEmail redaction stops at the end of the line", () => {
  const out = sanitizeForEmail("password: hunter2\nTypeError: x is undefined");
  assert.ok(!out.includes("hunter2"), out);
  assert.ok(out.includes("TypeError: x is undefined"), out);
});

test("sanitizeForEmail leaves ordinary error text alone", () => {
  const msg = "TypeError: Cannot read properties of undefined (reading 'title')";
  assert.equal(sanitizeForEmail(msg), msg);
});

test("sanitizeForEmail caps the output at 2000 characters", () => {
  assert.equal(sanitizeForEmail("x".repeat(5000)).length, 2000);
});

test("sanitizeForEmail maps nullish input to an empty string", () => {
  assert.equal(sanitizeForEmail(undefined), "");
  assert.equal(sanitizeForEmail(null), "");
  assert.equal(sanitizeForEmail(""), "");
});

// ---------------------------------------------------------- generateFingerprint

test("generateFingerprint collapses errors that differ only in numbers", () => {
  const a = generateFingerprint("TimeoutError", "Request timed out after 3000ms");
  const b = generateFingerprint("TimeoutError", "Request timed out after 15000ms");
  assert.equal(a, b);
});

test("generateFingerprint separates different error types", () => {
  assert.notEqual(
    generateFingerprint("TypeError", "boom"),
    generateFingerprint("RangeError", "boom"),
  );
});

test("generateFingerprint returns a stable md5 hex digest", () => {
  const fp = generateFingerprint("TypeError", "boom");
  assert.match(fp, /^[0-9a-f]{32}$/);
  assert.equal(
    fp,
    crypto.createHash("md5").update("TypeError:boom").digest("hex"),
  );
});

// ----------------------------------------------------------- determineSeverity

test("determineSeverity flags uncaught/unhandled and database failures as CRITICAL", () => {
  assert.equal(determineSeverity("UncaughtException", "whatever"), "CRITICAL");
  assert.equal(determineSeverity("UnhandledRejection", "whatever"), "CRITICAL");
  assert.equal(determineSeverity("SomeType", "database connection lost"), "CRITICAL");
  assert.equal(determineSeverity("SomeType", "Cannot read properties of undefined"), "CRITICAL");
  assert.equal(determineSeverity("SomeType", "x is not a function"), "CRITICAL");
});

test("determineSeverity flags plain errors, failures and timeouts as ERROR", () => {
  assert.equal(determineSeverity("TypeError", "boom"), "ERROR");
  assert.equal(determineSeverity("SomeType", "Upload failed"), "ERROR");
  assert.equal(determineSeverity("SomeType", "request timeout"), "ERROR");
});

test("determineSeverity flags warnings as WARN", () => {
  assert.equal(determineSeverity("ConsoleWarning", "something"), "WARN");
  assert.equal(determineSeverity("SomeType", "this API is deprecated"), "WARN");
});

test("determineSeverity defaults to ERROR for unknown shapes", () => {
  assert.equal(determineSeverity("Whatever", "nothing notable"), "ERROR");
});

// -------------------------------------------------------- buildErrorEmailHtml

const BASE_FIELDS = {
  appName: "Websuli",
  repoPath: "D:\\repo\\WEBSULI",
  githubRepo: "kosazoltan/WEBSULI",
  severity: "ERROR",
  fingerprint: "0".repeat(32),
  signature: "a".repeat(64),
  timestamp: "2026-08-31T07:00:00.000Z",
};

test("buildErrorEmailHtml escapes the client-controlled environment field", () => {
  const html = buildErrorEmailHtml({ ...BASE_FIELDS, environment: "<svg onload=alert()>" });
  assert.ok(!html.includes("<svg"), html);
  assert.ok(html.includes("&lt;svg onload=alert()&gt;"), html);
});

test("buildErrorEmailHtml escapes the client-controlled commitSha field", () => {
  const html = buildErrorEmailHtml({ ...BASE_FIELDS, commitSha: "<img src=x onerror=1>" });
  assert.ok(!html.includes("<img"), html);
});

test("buildErrorEmailHtml escapes every remaining untrusted field", () => {
  const payload = "<b>x</b>";
  const html = buildErrorEmailHtml({
    ...BASE_FIELDS,
    errorType: payload,
    message: payload,
    url: payload,
    requestId: payload,
    user: payload,
    browser: payload,
    stack: payload,
  });
  // The only <b> allowed to survive is the structural <strong> around severity.
  assert.ok(!html.includes("<b>"), html);
  assert.equal(html.split("&lt;b&gt;x&lt;/b&gt;").length - 1, 7);
});

test("buildErrorEmailHtml still redacts credentials inside message and stack", () => {
  const html = buildErrorEmailHtml({
    ...BASE_FIELDS,
    message: "login failed for password: hunter2",
    stack: "at auth (token: sk-live-xyz)",
  });
  assert.ok(!html.includes("hunter2"), html);
  assert.ok(!html.includes("sk-live-xyz"), html);
});

test("buildErrorEmailHtml omits the optional blocks when absent", () => {
  const html = buildErrorEmailHtml(BASE_FIELDS);
  assert.ok(!html.includes("Stack Trace"), html);
  assert.ok(!html.includes("Breadcrumbs"), html);
  assert.ok(html.includes("<td>N/A</td>"), html); // commitSha fallback
});

test("buildErrorEmailHtml renders breadcrumbs as escaped JSON", () => {
  const html = buildErrorEmailHtml({
    ...BASE_FIELDS,
    breadcrumbs: [{ type: "click", label: "<script>" }],
  });
  assert.ok(html.includes("Breadcrumbs"), html);
  assert.ok(!html.includes("<script>"), html);
  assert.ok(html.includes("&lt;script&gt;"), html);
});
