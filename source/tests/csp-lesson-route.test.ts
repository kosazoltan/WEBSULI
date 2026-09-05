import assert from "node:assert/strict";
import test from "node:test";

import {
  globalCspDirectives,
  isLessonRoute,
  lessonCspDirectives,
} from "../server/lib/csp-profiles";

/**
 * LS-4 — the strict CSP on /lesson/* (master plan §4).
 *
 * A lesson is DATA rendered by one audited bundle. The strict profile must
 * therefore never regain `'unsafe-inline'` or `'unsafe-eval'` in its script
 * sources — this test is the ratchet. The legacy global profile stays as it is
 * (user-uploaded HTML relies on inline handlers), and the two profiles must
 * demonstrably differ, or the strict one is not strict.
 */

const CTX = { allowedOrigins: ["https://websuli.vip"], isDevelopment: false };

test("a lecke-profil script-src-je CSAK 'self' — nincs unsafe-inline/unsafe-eval", () => {
  const csp = lessonCspDirectives(CTX);
  assert.deepEqual(csp.scriptSrc, ["'self'"]);
  assert.deepEqual(csp.scriptSrcAttr, ["'none'"]);
  for (const directive of Object.keys(csp)) {
    for (const value of csp[directive]) {
      assert.ok(
        !value.includes("unsafe-inline") || directive === "styleSrc",
        `${directive}: az unsafe-inline csak a styleSrc-ben tűrhető`,
      );
      assert.ok(!value.includes("unsafe-eval"), `${directive}: az unsafe-eval sehol nem tűrhető`);
    }
  }
});

test("a globális profil változatlan — a lecke-profil ettől szigorúbb", () => {
  const global = globalCspDirectives(CTX);
  const lesson = lessonCspDirectives(CTX);
  assert.ok(global.scriptSrc.includes("'unsafe-inline'"), "az örökölt anyagok profilja nem változik");
  assert.notDeepEqual(global.scriptSrc, lesson.scriptSrc, "a két profil valóban különbözik");
});

test("isLessonRoute pontosan a /lesson/* utakat ismeri fel", () => {
  assert.equal(isLessonRoute("/lesson"), true);
  assert.equal(isLessonRoute("/lesson/abc-123"), true);
  assert.equal(isLessonRoute("/lessons"), false, "a /lessons lista nem a lecke-oldal");
  assert.equal(isLessonRoute("/dev/123"), false);
  assert.equal(isLessonRoute("/materials/lesson-1"), false);
});
