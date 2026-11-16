import type { Router } from "express";
import type { User } from "../shared/schema";
import { adminInactiveReason, isAdminUser, isAllowlistedAdminEmail, prepareAdminAccess, storedAdminFlag, type AdminInactiveReason } from "./lib/admin-access";

/**
 * Admin felhasználókezelés (docs/specs/2026-10-18-admin-korszerusites.md): a Felhasználók fül végpontjai.
 * A válasz jelszó-hash nélküli; a saját fiók és az utolsó admin védett.
 * JM7c-1 (terv 10.4a): az `isAdmin` mező és az „utolsó admin” számlálása a SZÁMOLT admin-jog (jelző ÉS engedélylista ÉS nem
 * tiltott — server/lib/admin-access.ts); admin-jogot csak az engedélylistán lévő cím kaphat.
 * Review #462: a lista KÜLÖN adja a tárolt jelzőt (`storedIsAdmin`) és az eltérés okát (`adminInactiveReason`: tiltott /
 * nincs a listán), hogy a felület a nem érvényes jelzőt is mutassa, és a jelző ELVÉTELE mindig elérhető legyen.
 */
export type PublicUser = Pick<User, "id" | "email" | "firstName" | "lastName" | "profileImageUrl" | "isAdmin" | "isBanned" | "lastSeenAt" | "createdAt">
  & { storedIsAdmin: boolean; adminInactiveReason: AdminInactiveReason | null };
export const publicUser = (u: User): PublicUser => ({
  id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, profileImageUrl: u.profileImageUrl,
  isAdmin: isAdminUser(u), isBanned: u.isBanned, lastSeenAt: u.lastSeenAt, createdAt: u.createdAt,
  storedIsAdmin: storedAdminFlag(u), adminInactiveReason: adminInactiveReason(u),
});

export type AdminUserAction = "delete" | "ban" | "unban" | "grantAdmin" | "revokeAdmin";
type GuardUser = Pick<User, "id" | "isAdmin"> & Partial<Pick<User, "email" | "isBanned">>;
export function adminUserGuard(input: { actorId: string; targetId: string; action: AdminUserAction; users: readonly GuardUser[] }): string | null {
  const { actorId, targetId, action, users } = input;
  const self = actorId === targetId;
  if (self && (action === "delete" || action === "ban" || action === "revokeAdmin")) return "A saját fiókodon ez a művelet nem végezhető el.";
  const target = users.find(u => u.id === targetId);
  const admins = users.filter(u => isAdminUser(u)).length;
  if (target && isAdminUser(target) && admins <= 1 && (action === "delete" || action === "revokeAdmin")) return "Az utolsó admin fiók nem törölhető, és nem vehető el tőle az admin jog.";
  return null;
}

type UserStorage = {
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;
  toggleUserBan(id: string, banned: boolean): Promise<boolean>;
  toggleUserAdmin(id: string, isAdmin: boolean): Promise<boolean>;
};

/**
 * Az admin-műveletek zára (review #287): `acquire()` után az ellenőrzés és az írás között más admin-művelet nem futhat;
 * a visszaadott függvény oldja fel. Élesben a `routes.ts` adatbázis-zárat ad (több példány esetén is sorosít).
 */
export type AdminLock = () => Promise<() => Promise<void>>;

/** Folyamaton belüli zár (tesztekhez és fejlesztéshez). */
export function createMemoryLock(): AdminLock {
  let tail: Promise<void> = Promise.resolve();
  return async () => {
    let release!: () => void;
    const prev = tail;
    tail = new Promise<void>(r => { release = r; });
    await prev;
    return async () => release();
  };
}

export type ActionOutcome = { status: number; message?: string };

/** A friss lista beolvasása és az ellenőrzés — a hívó a zár alatt futtatja, és csak `null` eredménynél ír. */
export async function checkAdminUserAction(storage: UserStorage, input: { actorId: string; targetId: string; action: AdminUserAction }): Promise<ActionOutcome | null> {
  const users = await storage.getAllUsers();
  const target = users.find(u => u.id === input.targetId);
  if (!target) return { status: 404, message: "A felhasználó nem található." };
  if (input.action === "grantAdmin" && !isAllowlistedAdminEmail(target.email)) {
    return { status: 400, message: "Ez a cím nincs az admin-engedélylistán (ADMIN_ALLOWLIST), ezért nem kaphat admin-jogot. Előbb a szerver beállításában kell felvenni." };
  }
  await prepareAdminAccess();
  const err = adminUserGuard({ ...input, users });
  return err ? { status: 400, message: err } : null;
}

export function registerAdminUserRoutes(router: Router, storage: UserStorage, lock: AdminLock = createMemoryLock()): void {
  const actorOf = (req: { user?: unknown }) => (req.user as { id?: string } | undefined)?.id ?? "";

  router.get("/users", async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      await prepareAdminAccess();
      res.json(users.map(publicUser));
    } catch {
      res.status(500).json({ message: "Nem sikerült betölteni a felhasználókat." });
    }
  });

  router.delete("/users/:id", async (req, res) => {
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lock();
      const fail = await checkAdminUserAction(storage, { actorId: actorOf(req), targetId: req.params.id, action: "delete" });
      if (fail) return res.status(fail.status).json({ message: fail.message });
      await storage.deleteUser(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Nem sikerült törölni a felhasználót." });
    } finally {
      await release?.();
    }
  });

  router.patch("/users/:id/ban", async (req, res) => {
    const banned = (req.body as { banned?: unknown } | undefined)?.banned;
    if (typeof banned !== "boolean") return res.status(400).json({ message: "A „banned” mező kötelező (igaz/hamis)." });
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lock();
      const fail = await checkAdminUserAction(storage, { actorId: actorOf(req), targetId: req.params.id, action: banned ? "ban" : "unban" });
      if (fail) return res.status(fail.status).json({ message: fail.message });
      await storage.toggleUserBan(req.params.id, banned);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Nem sikerült módosítani a tiltást." });
    } finally {
      await release?.();
    }
  });

  router.put("/users/:id/toggle-admin", async (req, res) => {
    const { isAdmin } = (req.body ?? {}) as { isAdmin?: unknown }; // a KÉRÉS mezője (a kívánt állapot), nem jogosultság-olvasás
    if (typeof isAdmin !== "boolean") return res.status(400).json({ message: "Az „isAdmin” mező kötelező (igaz/hamis)." });
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lock();
      const fail = await checkAdminUserAction(storage, { actorId: actorOf(req), targetId: req.params.id, action: isAdmin ? "grantAdmin" : "revokeAdmin" });
      if (fail) return res.status(fail.status).json({ message: fail.message });
      await storage.toggleUserAdmin(req.params.id, isAdmin);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Nem sikerült módosítani a jogosultságot." });
    } finally {
      await release?.();
    }
  });
}
