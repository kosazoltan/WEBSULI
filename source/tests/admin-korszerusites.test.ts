import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminUserGuard, publicUser } from "../server/admin-users";
import { ADMIN_TAB_GROUPS, ADMIN_TAB_VALUES, resolveAdminTab } from "../client/src/lib/admin-tabs";
import type { User } from "../shared/schema";

// Spec: docs/specs/2026-10-18-admin-korszerusites.md

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("keresőmező: az Input alaposztálya saját szövegszínt ad (fehér alapon nem fehér betű)", () => {
  assert.match(read("client/src/components/ui/input.tsx"), /bg-background text-foreground/);
});

test("felhasználók: a válasz jelszó-hash nélküli", () => {
  const u = { id: "1", email: "a@b.c", password: "hash", googleId: "g", firstName: "A", lastName: "B", profileImageUrl: null, isAdmin: false, isBanned: false, lastSeenAt: null, createdAt: null, updatedAt: null } as User;
  const out = publicUser(u) as Record<string, unknown>;
  assert.equal("password" in out, false);
  assert.equal("googleId" in out, false);
  assert.deepEqual(Object.keys(out).sort(), ["createdAt", "email", "firstName", "id", "isAdmin", "isBanned", "lastName", "lastSeenAt", "profileImageUrl"]);
});

test("felhasználók: a saját fiók és az utolsó admin védett, más műveletek engedettek", () => {
  const oneAdmin = [{ id: "me", isAdmin: true }, { id: "x", isAdmin: false }];
  const twoAdmins = [{ id: "me", isAdmin: true }, { id: "y", isAdmin: true }];
  assert.match(adminUserGuard({ actorId: "me", targetId: "me", action: "delete", users: twoAdmins })!, /saját fiók/);
  assert.match(adminUserGuard({ actorId: "me", targetId: "me", action: "ban", users: twoAdmins })!, /saját fiók/);
  assert.match(adminUserGuard({ actorId: "me", targetId: "me", action: "revokeAdmin", users: twoAdmins })!, /saját fiók/);
  assert.match(adminUserGuard({ actorId: "other", targetId: "me", action: "revokeAdmin", users: oneAdmin })!, /utolsó admin/);
  assert.match(adminUserGuard({ actorId: "other", targetId: "me", action: "delete", users: oneAdmin })!, /utolsó admin/);
  assert.equal(adminUserGuard({ actorId: "me", targetId: "y", action: "revokeAdmin", users: twoAdmins }), null);
  assert.equal(adminUserGuard({ actorId: "me", targetId: "x", action: "ban", users: oneAdmin }), null);
  assert.equal(adminUserGuard({ actorId: "me", targetId: "x", action: "grantAdmin", users: oneAdmin }), null);
});

test("felhasználók: a végpontok az admin-routeren regisztráltak", () => {
  assert.match(read("server/routes.ts"), /registerAdminUserRoutes\(adminRouter, storage\)/);
  const src = read("server/admin-users.ts");
  for (const r of [/router\.get\("\/users"/, /router\.delete\("\/users\/:id"/, /router\.patch\("\/users\/:id\/ban"/, /router\.put\("\/users\/:id\/toggle-admin"/]) assert.match(src, r);
});

test("menü: 4 csoport, 15 fül, mindnek ikonja; a megszűnt fülek régi linkjei a tananyagkészítésre visznek", () => {
  assert.deepEqual(ADMIN_TAB_GROUPS.map(g => g.label), ["Tananyagok", "Készítés és javítás", "Kommunikáció", "Rendszer"]);
  assert.equal(ADMIN_TAB_VALUES.length, 15);
  assert.equal(new Set(ADMIN_TAB_VALUES).size, 15);
  assert.ok(!ADMIN_TAB_VALUES.includes("enhanced"));
  for (const t of ADMIN_TAB_GROUPS.flatMap(g => g.tabs)) {
    assert.ok(typeof t.icon === "function" || typeof t.icon === "object", t.value);
    assert.ok(t.label.trim(), t.value);
  }
  assert.equal(resolveAdminTab("enhanced"), "lesson-studio");
  assert.equal(resolveAdminTab("knowledge-maps"), "lesson-studio");
  assert.equal(resolveAdminTab("emails"), "emails");
  assert.equal(resolveAdminTab("ismeretlen"), "files");
  assert.equal(resolveAdminTab(null), "files");
  const admin = read("client/src/pages/admin.tsx");
  assert.doesNotMatch(admin, /value="enhanced"/);
  for (const v of ADMIN_TAB_VALUES) assert.match(admin, new RegExp(`TabsContent value="${v}"`), v);
});
