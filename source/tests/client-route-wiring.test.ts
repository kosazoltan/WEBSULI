import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Audit 2026-09-05 (szelet A/E) — client route wiring guards.
 *
 * Measured defects: the coupon-expired overlay linked to `/lesson/:id` while App.tsx had no
 * such route (child landed on NotFound after play time ran out), and `knowledge-maps` was
 * rendered as an admin tab but missing from `validTabs`, so `?tab=knowledge-maps` fell back
 * to `files`. These tests bind the three sites together so the drift cannot recur silently.
 */

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (rel: string) => readFileSync(path.join(decodeURIComponent(ROOT), rel), "utf8");

test("every internal path the coupon HUD navigates to is a declared App route", () => {
  const hud = read("client/src/game-engine/CouponHud.tsx");
  const app = read("client/src/App.tsx");
  const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
  const prefixes = [...hud.matchAll(/`\/(lesson|games|preview)\//g)].map((m) => `/${m[1]}/:id`);
  assert.ok(prefixes.length > 0, "a HUD-nak van belső linkje");
  for (const p of new Set(prefixes)) {
    assert.ok(routes.includes(p), `a HUD ${p} útvonalra mutat, de App.tsx nem deklarálja`);
  }
});

test("admin.tsx: every menu tab is a valid deep link and has content (?tab= works)", async () => {
  // Spec 2026-10-18-admin-korszerusites (dokumentált spec-változás): a fülsor a közös lib/admin-tabs.ts-ből renderel; a deep linket a resolveAdminTab dönti el.
  const { ADMIN_TAB_VALUES, resolveAdminTab } = await import("../client/src/lib/admin-tabs");
  const admin = read("client/src/pages/admin.tsx");
  assert.match(admin, /resolveAdminTab\(new URLSearchParams\(window\.location\.search\)\.get\("tab"\)\)/);
  assert.ok(ADMIN_TAB_VALUES.length >= 10);
  for (const t of ADMIN_TAB_VALUES) {
    assert.equal(resolveAdminTab(t), t, `a "${t}" fül deep linkje nem a saját fülére visz`);
    assert.match(admin, new RegExp(`<TabsContent value="${t}"`), `a "${t}" fülnek nincs tartalma`);
  }
});
