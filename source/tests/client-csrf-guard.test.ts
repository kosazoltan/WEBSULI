import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Guard for a defect class that every local test passed through (measured 2026-09-04).
 *
 * LS-3b shipped a section Próba and a bonus call written as bare `fetch(..., {method:
 * "POST"})`. Unit tests never cross the middleware, and the Playwright suite exercises
 * pages that do not submit — so tsc, eslint, 356 unit tests and 20 e2e tests were all
 * green while the feature would have returned 403 the first time a child pressed the
 * button. It was caught by probing production, which is one deploy too late.
 *
 * The rule: mutating requests from the client go through `apiRequest`, which attaches
 * the CSRF token (fetched from the public GET /api/csrf-token — works without a login,
 * which matters because a child's push subscription is anonymous).
 *
 * One legitimate exception: routes the SERVER deliberately guards by Origin/Referer
 * allowlist instead of a CSRF synchroniser token (they cannot carry one: no session
 * exists yet for login/logout, SSE streams open before the token fetch, and the
 * material iframe is a foreign context). Those are listed below with their reason and
 * are not failures — which is why the list names the exact server skip list in
 * routes.ts, not a client-side opinion.
 *
 * Anything else that trips this guard gets a 403 in production, period.
 */

const CLIENT_SRC = path.join(import.meta.dirname, "..", "client", "src");

/**
 * Routes the server guards by Origin allowlist instead of a CSRF token
 * (routes.ts:744-757 — the `enforceOriginAllowlist` branches). Mirror of the server's
 * decision; the two must not drift apart.
 */
const SERVER_ORIGIN_GUARDED: { prefix: string; why: string }[] = [
  { prefix: "/api/login", why: "nincs még session, a tokent nem tudná hitelesíteni" },
  { prefix: "/api/logout", why: "kijelentkezés nem viselhet session-höz kötött tokent" },
  { prefix: "/api/ai/", why: "SSE folyamok — a böngésző fetch-e nem tud fejlécet rakni rájuk" },
  {
    prefix: "/api/admin/improve-material/",
    why: "hosszú SSE folyam, a szerver Origin-allowlisttel őrzi",
  },
  {
    prefix: "/api/admin/improved-files/",
    why: "ugyanaz a család, mint az improve-material",
  },
  {
    prefix: "/api/material-result",
    why: "a tananyag-iframe-ből jön, nincs tokenje",
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Find `fetch(` calls whose options object names a mutating method.
 *
 * Deliberately textual: the point is to be cheap and to run on every commit. A false
 * positive is fixed by using apiRequest, which is what we wanted anyway.
 */
function mutatingFetches(source: string): string[] {
  const hits: string[] = [];
  const re = /fetch\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source)) !== null) {
    // Look at the call's neighbourhood: enough for the options object, not the whole file.
    const window = source.slice(match.index, match.index + 400);
    if (!/method\s*:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/.test(window)) continue;
    if (/x-csrf-token/i.test(window)) continue;

    const urlMatch = /fetch\s*\(\s*[`"']([^`"']+)/.exec(window);
    const url = urlMatch?.[1] ?? "(dinamikus URL)";
    if (SERVER_ORIGIN_GUARDED.some((entry) => url.startsWith(entry.prefix))) continue;

    hits.push(url);
  }
  return hits;
}

test("a kliens nem küld nyers mutáló fetch-et CSRF-token nélkül", () => {
  const found: string[] = [];

  for (const file of walk(CLIENT_SRC)) {
    const source = readFileSync(file, "utf8");
    for (const url of mutatingFetches(source)) {
      // Forward slashes: the entry must read the same on Windows and on CI's Linux.
      found.push(`${path.relative(CLIENT_SRC, file).replace(/\\/g, "/")} → ${url}`);
    }
  }

  const unique = [...new Set(found)];

  assert.deepEqual(
    unique,
    [],
    "Ezek a hívások 403-at kapnának élesben. Használj apiRequest-et " +
      "(az teszi rá a CSRF-tokent), vagy vedd fel a szerver routes.ts " +
      "Origin-allowlistes kivétellistájára ÉS tükrözd itt:\n" +
      unique.join("\n"),
  );
});

test("AC1 a szerver által mentesített útvonalak raw fetch-ei nem hibák", () => {
  // The guard must know the server's own exemptions, or it flags the login page itself.
  const samples = [
    `fetch("/api/login", { method: "POST", body: "{}" });`,
    `fetch("/api/logout", { method: "POST" });`,
    `fetch("/api/ai/enhanced-creator/analyze-files", { method: "POST", body: "{}" });`,
    `fetch("/api/admin/improve-material/x", { method: "POST" });`,
    `fetch("/api/admin/improved-files/x", { method: "POST" });`,
    `fetch("/api/material-result", { method: "POST", body: "{}" });`,
  ];

  for (const sample of samples) {
    assert.deepEqual(
      mutatingFetches(sample),
      [],
      `a szerver által mentesített útvonal nem lehet hiba: ${sample}`,
    );
  }
});

test("az őr tényleg észreveszi a hibás mintát", () => {
  // Reverse mutation in test form: if the detector were broken, the test above would
  // pass on an empty codebase and prove nothing.
  const bad = `await fetch("/api/lessons/x/proba", { method: "POST", body: "{}" });`;
  assert.deepEqual(mutatingFetches(bad), ["/api/lessons/x/proba"]);

  // NOT exempt just because it starts with /api/admin/: the server skip list is
  // exact, and /api/admin/materials/* is CSRF-protected.
  const adminButProtected = `fetch("/api/admin/materials/1/generate-quiz", { method: "POST" });`;
  assert.deepEqual(mutatingFetches(adminButProtected), ["/api/admin/materials/1/generate-quiz"]);

  const good = `await apiRequest("POST", "/api/lessons/x/proba", {});`;
  assert.deepEqual(mutatingFetches(good), []);

  const read = `await fetch("/api/lessons/coupons/active");`;
  assert.deepEqual(mutatingFetches(read), [], "a GET nem érdekes");
});
