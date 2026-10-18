import type { Router } from "express";
import type { User } from "../shared/schema";

/**
 * Admin felhasználókezelés (docs/specs/2026-10-18-admin-korszerusites.md): a Felhasználók fül végpontjai.
 * A válasz jelszó-hash nélküli; a saját fiók és az utolsó admin védett.
 */
export type PublicUser = Pick<User, "id" | "email" | "firstName" | "lastName" | "profileImageUrl" | "isAdmin" | "isBanned" | "lastSeenAt" | "createdAt">;
export const publicUser = (u: User): PublicUser => ({
  id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, profileImageUrl: u.profileImageUrl,
  isAdmin: u.isAdmin, isBanned: u.isBanned, lastSeenAt: u.lastSeenAt, createdAt: u.createdAt,
});

export type AdminUserAction = "delete" | "ban" | "unban" | "grantAdmin" | "revokeAdmin";
export function adminUserGuard(input: { actorId: string; targetId: string; action: AdminUserAction; users: readonly Pick<User, "id" | "isAdmin">[] }): string | null {
  const { actorId, targetId, action, users } = input;
  const self = actorId === targetId;
  if (self && (action === "delete" || action === "ban" || action === "revokeAdmin")) return "A saját fiókodon ez a művelet nem végezhető el.";
  const target = users.find(u => u.id === targetId);
  const admins = users.filter(u => u.isAdmin).length;
  if (target?.isAdmin && admins <= 1 && (action === "delete" || action === "revokeAdmin")) return "Az utolsó admin fiók nem törölhető, és nem vehető el tőle az admin jog.";
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
  if (!users.some(u => u.id === input.targetId)) return { status: 404, message: "A felhasználó nem található." };
  const err = adminUserGuard({ ...input, users });
  return err ? { status: 400, message: err } : null;
}

export function registerAdminUserRoutes(router: Router, storage: UserStorage, lock: AdminLock = createMemoryLock()): void {
  const actorOf = (req: { user?: unknown }) => (req.user as { id?: string } | undefined)?.id ?? "";

  router.get("/users", async (_req, res) => {
    try {
      res.json((await storage.getAllUsers()).map(publicUser));
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
    const isAdmin = (req.body as { isAdmin?: unknown } | undefined)?.isAdmin;
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
