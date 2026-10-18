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

export function registerAdminUserRoutes(router: Router, storage: UserStorage): void {
  const actorOf = (req: { user?: unknown }) => (req.user as { id?: string } | undefined)?.id ?? "";
  async function guarded(req: { params: { id: string }; user?: unknown }, action: AdminUserAction): Promise<{ status: number; message: string } | null> {
    const users = await storage.getAllUsers();
    if (!users.some(u => u.id === req.params.id)) return { status: 404, message: "A felhasználó nem található." };
    const err = adminUserGuard({ actorId: actorOf(req), targetId: req.params.id, action, users });
    return err ? { status: 400, message: err } : null;
  }

  router.get("/users", async (_req, res) => {
    try {
      res.json((await storage.getAllUsers()).map(publicUser));
    } catch {
      res.status(500).json({ message: "Nem sikerült betölteni a felhasználókat." });
    }
  });

  router.delete("/users/:id", async (req, res) => {
    try {
      const fail = await guarded(req, "delete");
      if (fail) return res.status(fail.status).json({ message: fail.message });
      await storage.deleteUser(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Nem sikerült törölni a felhasználót." });
    }
  });

  router.patch("/users/:id/ban", async (req, res) => {
    const banned = (req.body as { banned?: unknown } | undefined)?.banned;
    if (typeof banned !== "boolean") return res.status(400).json({ message: "A „banned” mező kötelező (igaz/hamis)." });
    try {
      const fail = await guarded(req, banned ? "ban" : "unban");
      if (fail) return res.status(fail.status).json({ message: fail.message });
      await storage.toggleUserBan(req.params.id, banned);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Nem sikerült módosítani a tiltást." });
    }
  });

  router.put("/users/:id/toggle-admin", async (req, res) => {
    const isAdmin = (req.body as { isAdmin?: unknown } | undefined)?.isAdmin;
    if (typeof isAdmin !== "boolean") return res.status(400).json({ message: "Az „isAdmin” mező kötelező (igaz/hamis)." });
    try {
      const fail = await guarded(req, isAdmin ? "grantAdmin" : "revokeAdmin");
      if (fail) return res.status(fail.status).json({ message: fail.message });
      await storage.toggleUserAdmin(req.params.id, isAdmin);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Nem sikerült módosítani a jogosultságot." });
    }
  });
}
