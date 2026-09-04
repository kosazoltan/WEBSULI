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
 * the CSRF token. If a route genuinely cannot carry a token, it has to be added to the
 * server's explicit skip list in routes.ts — a deliberate, reviewable decision — and
 * listed here with the reason.
 */

const CLIENT_SRC = path.join(import.meta.dirname, "..", "client", "src");

/** Routes the server deliberately guards by Origin allowlist instead of a CSRF token. */
const ORIGIN_GUARDED = [
  "/api/material-result", // called from inside a material iframe, has no token
];

/**
 * Inherited offenders, measured 2026-09-04 and ticketed as kanban #107.
 *
 * This is a baseline, not an amnesty: the list may only shrink.
 *
 * Evidence note, because it is easy to get wrong: a curl without a token returns 403 on
 * *every* protected route, so probing production proves nothing on its own. The evidence
 * here is the code — `lib/pushNotifications.ts` builds the request by hand and no token
 * is attached anywhere along that path, so a real browser sends the same tokenless POST
 * curl did. `LikeButton` also 403s under curl but goes through `apiRequest`, which is why
 * it is not on this list.
 *
 * They are listed rather than fixed here because untangling twelve call sites belongs in
 * its own slice, not in a reward feature's commit.
 *
 * Anything NOT on this list is new, and new offenders fail the test.
 */
const INHERITED_2026_09_04 = new Set([
  "components/AuthStatus.tsx → /api/logout",
  "components/EnhancedMaterialCreator.tsx → /api/ai/enhanced-creator/analyze-files",
  "components/EnhancedMaterialCreator.tsx → /api/ai/enhanced-creator/chatgpt-chat",
  "components/EnhancedMaterialCreator.tsx → /api/ai/enhanced-creator/claude-chat",
  "components/EnhancedMaterialCreator.tsx → /api/html-files",
  "components/ErrorReporter.tsx → /api/error-report",
  "components/FileCard.tsx → /api/admin/materials/${id}/generate-quiz",
  "components/MaterialImprover.tsx → /api/admin/improve-material/${fileId}",
  "components/SystemPromptEditor.tsx → /api/admin/system-prompts/${promptId}",
  "lib/pushNotifications.ts → /api/push/subscribe",
  "lib/pushNotifications.ts → /api/push/unsubscribe",
  "pages/Login.tsx → /api/login",
]);

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
    if (ORIGIN_GUARDED.some((skip) => url.startsWith(skip))) continue;

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
  const fresh = unique.filter((entry) => !INHERITED_2026_09_04.has(entry));

  assert.deepEqual(
    fresh,
    [],
    "Ezek a hívások 403-at kapnának élesben. Használj apiRequest-et " +
      "(az teszi rá a CSRF-tokent), vagy vedd fel a szerver kivétellistájára:\n" +
      fresh.join("\n"),
  );

  // The baseline may only shrink. A fixed call site must be deleted from the list,
  // or the list quietly becomes a place where problems are stored instead of solved.
  const stale = [...INHERITED_2026_09_04].filter((entry) => !unique.includes(entry));
  assert.deepEqual(
    stale,
    [],
    "Ezek már javítva vannak — vedd ki őket az INHERITED_2026_09_04 listából:\n" +
      stale.join("\n"),
  );
});

test("az őr tényleg észreveszi a hibás mintát", () => {
  // Reverse mutation in test form: if the detector were broken, the test above would
  // pass on an empty codebase and prove nothing.
  const bad = `await fetch("/api/lessons/x/proba", { method: "POST", body: "{}" });`;
  assert.deepEqual(mutatingFetches(bad), ["/api/lessons/x/proba"]);

  const good = `await apiRequest("POST", "/api/lessons/x/proba", {});`;
  assert.deepEqual(mutatingFetches(good), []);

  const read = `await fetch("/api/lessons/coupons/active");`;
  assert.deepEqual(mutatingFetches(read), [], "a GET nem érdekes");
});
