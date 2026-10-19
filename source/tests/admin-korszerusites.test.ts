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
  assert.match(read("server/routes.ts"), /registerAdminUserRoutes\(adminRouter, storage, /);
  const src = read("server/admin-users.ts");
  for (const r of [/router\.get\("\/users"/, /router\.delete\("\/users\/:id"/, /router\.patch\("\/users\/:id\/ban"/, /router\.put\("\/users\/:id\/toggle-admin"/]) assert.match(src, r);
});

test("menü: 4 csoport, 16 fül (S4: Tanulók — docs/specs/2026-10-18-tanuloi-profil-s4-vegrehajtas.md), mindnek ikonja; a megszűnt fülek régi linkjei a tananyagkészítésre visznek", () => {
  // Spec 2026-10-19-admin-menu-nevek (dokumentált spec-változás): a csoportnév a funkciókat mondja.
  assert.deepEqual(ADMIN_TAB_GROUPS.map(g => g.label), ["Tananyagok", "Készítés és javítás", "Tanulók és levelek", "Rendszer és mentések"]);
  assert.equal(ADMIN_TAB_VALUES.length, 16);
  assert.equal(new Set(ADMIN_TAB_VALUES).size, 16);
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

test("review #287: két egyidejű admin-jog megvonás / törlés sem hagyja admin nélkül a rendszert (zár alatt ellenőrzés + írás)", async () => {
  const { checkAdminUserAction, createMemoryLock } = await import("../server/admin-users");
  const rows = new Map([["a", { id: "a", isAdmin: true }], ["b", { id: "b", isAdmin: true }]]);
  const tick = () => new Promise(r => setTimeout(r, 5));
  const storage = {
    getAllUsers: async () => { await tick(); return [...rows.values()].map(r => ({ ...r }) as unknown as User); },
    deleteUser: async (id: string) => { await tick(); return rows.delete(id); },
    toggleUserBan: async () => true,
    toggleUserAdmin: async (id: string, isAdmin: boolean) => { await tick(); rows.get(id)!.isAdmin = isAdmin; return true; },
  };
  const lock = createMemoryLock();
  // ugyanaz a sorrend, mint a végpontokban: zár → ellenőrzés → írás → feloldás
  const act = async (actorId: string, targetId: string, action: "revokeAdmin" | "delete") => {
    const release = await lock();
    try {
      const fail = await checkAdminUserAction(storage, { actorId, targetId, action });
      if (fail) return fail.status;
      if (action === "delete") await storage.deleteUser(targetId); else await storage.toggleUserAdmin(targetId, false);
      return 200;
    } finally { await release(); }
  };
  assert.deepEqual((await Promise.all([act("a", "b", "revokeAdmin"), act("b", "a", "revokeAdmin")])).sort(), [200, 400]);
  assert.equal([...rows.values()].filter(r => r.isAdmin).length, 1, "pontosan egy admin marad");
  rows.set("b", { id: "b", isAdmin: true }); rows.get("a")!.isAdmin = true;
  await Promise.all([act("a", "b", "delete"), act("b", "a", "revokeAdmin")]);
  assert.equal([...rows.values()].filter(r => r.isAdmin).length, 1);
  // a zár nélkül ugyanez admin nélkül hagyná a rendszert (a teszt valóban a zárat méri)
  rows.set("b", { id: "b", isAdmin: true }); rows.get("a")!.isAdmin = true;
  const unlocked = async (actorId: string, targetId: string) => { if (!(await checkAdminUserAction(storage, { actorId, targetId, action: "revokeAdmin" }))) await storage.toggleUserAdmin(targetId, false); };
  await Promise.all([unlocked("a", "b"), unlocked("b", "a")]);
  assert.equal([...rows.values()].filter(r => r.isAdmin).length, 0, "negatív kontroll");
  const src = read("server/admin-users.ts");
  for (const route of ["delete(\"/users/:id\"", "patch(\"/users/:id/ban\"", "put(\"/users/:id/toggle-admin\""]) {
    const start = src.indexOf(route);
    const next = src.indexOf("router.", start + route.length);
    const body = src.slice(start, next === -1 ? undefined : next);
    assert.match(body, /release = await lock\(\);[\s\S]*checkAdminUserAction[\s\S]*await storage\./, route);
    assert.match(body, /finally \{\s*await release\?\.\(\);/, route);
  }
  assert.match(read("server/routes.ts"), /pg_advisory_lock\(hashtext\('admin-users'\)\)/, "élesben adatbázis-zár sorosít");
});

test("review #287: a prototípus-kulcsok nem fül-azonosítók", () => {
  for (const p of ["constructor", "__proto__", "toString", "hasOwnProperty"]) assert.equal(resolveAdminTab(p), "files", p);
});

test("spec 2026-10-19-admin-menu-nevek: a mobil gombok neve a funkciókat mondja, a testid a csoport-id-ből", () => {
  const nav = readFileSync(new URL("../client/src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
  assert.match(nav, /SHORT_LABEL: Record<string, string> = \{ materials: "Tananyagok", authoring: "Készítés", communication: "Tanulók", system: "Rendszer" \}/);
  assert.match(nav, /data-testid=\{`mobile-nav-\$\{category\.value\}`\}/);
  assert.doesNotMatch(nav, /Üzenetek/);
});
