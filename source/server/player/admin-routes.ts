/**
 * JM7b — admin „Játékosok” végpontok (terv 10.4 „Tiltás”). A routes.ts az `adminRouter` alá csatolja
 * (`app.use('/api/admin', isAuthenticatedAdmin, adminRouter)`), így MINDEN végpont admin-őr mögött van, és az
 * admin-jogosultsági mátrix (tests/admin-authz-matrix-db.integration.ts) automatikusan lefedi.
 *
 *   GET  /api/admin/game-accounts?q=     → lista: becenév, MASZKOLT cím, létrehozás, utolsó belépés, tiltott-e
 *   GET  /api/admin/game-accounts/:id/email → a teljes cím (csak adminnak, külön kérésre; a napló maszkolt)
 *   POST /api/admin/game-accounts/:id/ban | /unban → tiltás / feloldás; a már belépett játékosra is azonnal hat (requirePlayer)
 * A flagtől független (az admin a kikapcsolt bevezetés alatt is látja / tilthatja a fiókokat).
 */
import express, { type Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";
import { maskEmail } from "../lib/mask-email";
import type { PlayerAccountStore } from "./account-store";

const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);
const errMsg = (error: unknown) => (error instanceof Error ? error.message : "ismeretlen hiba");

export function createPlayerAdminRouter(accounts: PlayerAccountStore): Router {
  const router = express.Router();

  router.get("/", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const q = typeof req.query.q === "string" ? req.query.q.slice(0, 64) : undefined;
      const rows = await accounts.listPlayers({ q });
      return res.json({
        players: rows.map((r) => ({
          id: r.id, nickname: r.nickname, avatar: r.avatarKey, maskedEmail: maskEmail(r.email), createdAt: r.createdAt,
          lastSeenAt: r.lastSeenAt, banned: r.banned, bannedAt: r.bannedAt, googleLinked: r.googleLinked, learnerLinked: r.learnerLinked,
        })),
      });
    } catch (error) {
      logger.error("[PLAYER-ADMIN] lista hiba:", errMsg(error));
      return res.status(500).json({ message: "Hiba a játékosok lekérésekor" });
    }
  });

  router.get("/:id/email", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: "Hibás azonosító" });
    try {
      const email = await accounts.playerEmailById(id.data);
      if (!email) return res.status(404).json({ message: "Nincs ilyen játékos" });
      logger.info(`[PLAYER-ADMIN] teljes cím megtekintve: ${maskEmail(email)}`);
      return res.json({ email });
    } catch (error) {
      logger.error("[PLAYER-ADMIN] cím-lekérés hiba:", errMsg(error));
      return res.status(500).json({ message: "Hiba a cím lekérésekor" });
    }
  });

  for (const action of ["ban", "unban"] as const) {
    router.post(`/:id/${action}`, async (req, res) => {
      const id = idSchema.safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Hibás azonosító" });
      try {
        const email = await accounts.playerEmailById(id.data);
        if (!email || !(await accounts.setBanned(id.data, action === "ban"))) return res.status(404).json({ message: "Nincs ilyen játékos" });
        logger.info(`[PLAYER-ADMIN] ${action === "ban" ? "tiltás" : "feloldás"}: ${maskEmail(email)}`);
        return res.json({ ok: true, banned: action === "ban" });
      } catch (error) {
        logger.error("[PLAYER-ADMIN] tiltás hiba:", errMsg(error));
        return res.status(500).json({ message: "Hiba a tiltás módosításakor" });
      }
    });
  }

  return router;
}
