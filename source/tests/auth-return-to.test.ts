import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeReturnTo, resolvePostLoginRedirect } from "../server/lib/return-to";

/**
 * LS-0a — Google OAuth `returnTo`.
 *
 * Before this slice the Google callback always redirected to `/admin`, so a pupil who
 * logged in only to sync game scores landed on the admin surface (403/empty for them).
 * The redirect target now comes from a caller-supplied `returnTo`, which is an
 * OPEN REDIRECT vector unless it is constrained to same-origin relative paths.
 */

// ------------------------------------------------------------------ sanitizeReturnTo

test("sanitizeReturnTo accepts a plain relative path", () => {
  assert.equal(sanitizeReturnTo("/games"), "/games");
});

test("sanitizeReturnTo accepts a path with hash and query", () => {
  assert.equal(sanitizeReturnTo("/lesson/abc#s-2"), "/lesson/abc#s-2");
  assert.equal(sanitizeReturnTo("/games?coupon=1&x=2"), "/games?coupon=1&x=2");
});

test("sanitizeReturnTo rejects a protocol-relative URL", () => {
  // `//evil.com` is a valid absolute URL for the browser — the classic open-redirect bypass.
  assert.equal(sanitizeReturnTo("//evil.com"), null);
  assert.equal(sanitizeReturnTo("/\\evil.com"), null);
});

test("sanitizeReturnTo rejects absolute and scheme URLs", () => {
  assert.equal(sanitizeReturnTo("https://evil.com"), null);
  assert.equal(sanitizeReturnTo("http://evil.com"), null);
  assert.equal(sanitizeReturnTo("javascript:alert(1)"), null);
});

test("sanitizeReturnTo rejects a path not starting with a single slash", () => {
  assert.equal(sanitizeReturnTo("games"), null);
  assert.equal(sanitizeReturnTo("../admin"), null);
});

test("sanitizeReturnTo rejects empty, blank, non-string and over-long input", () => {
  assert.equal(sanitizeReturnTo(""), null);
  assert.equal(sanitizeReturnTo("   "), null);
  assert.equal(sanitizeReturnTo(undefined), null);
  assert.equal(sanitizeReturnTo(null), null);
  assert.equal(sanitizeReturnTo(123 as unknown as string), null);
  assert.equal(sanitizeReturnTo("/" + "a".repeat(512)), null);
});

test("sanitizeReturnTo rejects control characters and CR/LF", () => {
  assert.equal(sanitizeReturnTo("/games\nSet-Cookie: x=1"), null);
  assert.equal(sanitizeReturnTo("/games\r\n"), null);
  assert.equal(sanitizeReturnTo("/games\u0000"), null);
});

// ------------------------------------------------------- resolvePostLoginRedirect

test("a non-admin without a stored path goes to /games", () => {
  assert.equal(resolvePostLoginRedirect({ isAdmin: false, stored: null }), "/games");
});

test("an admin without a stored path keeps the old /admin destination", () => {
  assert.equal(resolvePostLoginRedirect({ isAdmin: true, stored: null }), "/admin");
});

test("a stored path wins for a non-admin", () => {
  assert.equal(
    resolvePostLoginRedirect({ isAdmin: false, stored: "/lesson/x#s-1" }),
    "/lesson/x#s-1",
  );
});

test("a stored path wins for an admin too", () => {
  // An admin who clicked "log in" from a lesson page must return to that lesson,
  // not be bounced to the admin dashboard.
  assert.equal(resolvePostLoginRedirect({ isAdmin: true, stored: "/games" }), "/games");
});
