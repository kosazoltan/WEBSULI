import type { Express, Request } from "express";
import type { Pool } from "pg";
import { accountEmailKey } from "./player/codes";
import { getPlayerSessionId } from "./player/session";
import { normalizeTracks, isTrackId, trackOption, type TrackId } from "@shared/tracks";
import { logger } from "./lib/logger";
import { isAuthenticatedAdmin } from "./auth";

/**
 * Külön tananyagcsoportok végpontjai (docs/specs/2026-11-24-gimi-felveteli-csoport.md; #1986).
 * - `GET /api/tracks/mine`: a bejelentkezett fiók csoportjai (Google- és játékos-munkamenet; a P-020 fiókkulcsán). Vendég: [].
 * - `PUT /api/html-files/:id/tracks` (admin): egy anyag csoporttagsága; ismeretlen csoport 400.
 * - `GET|POST|DELETE /api/admin/track-assignments` (admin): fiók–csoport hozzárendelések (a cím a P-020 fiókkulcsára
 *   normalizálva; a repó nyilvános, ezért valódi cím csak itt, az adatbázisban él — tulajdonosi döntés 2026-11-24).
 */
export function registerTrackRoutes(app: Express, deps: { pool: Pool; invalidateFiles: () => Promise<void> }) {
  const { pool, invalidateFiles } = deps;

  async function sessionEmailKeys(req: Request): Promise<string[]> {
    const keys = new Set<string>();
    const userEmail = (req.user as { email?: unknown } | undefined)?.email;
    if (typeof userEmail === "string" && userEmail.includes("@")) keys.add(accountEmailKey(userEmail));
    const playerId = getPlayerSessionId(req);
    if (playerId) {
      const { rows } = await pool.query<{ email: string }>(`SELECT email FROM player_accounts WHERE id = $1 AND banned_at IS NULL`, [playerId]);
      if (rows[0]?.email) keys.add(accountEmailKey(rows[0].email));
    }
    return [...keys];
  }

  app.get("/api/tracks/mine", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const keys = await sessionEmailKeys(req);
      if (keys.length === 0) return res.json({ tracks: [] });
      const { rows } = await pool.query<{ track: string }>(`SELECT DISTINCT track FROM track_assignments WHERE email_key = ANY($1::text[]) ORDER BY track`, [keys]);
      res.json({ tracks: rows.map((r) => r.track).filter(isTrackId) as TrackId[] });
    } catch (error) {
      logger.warn("[tracks] a saját csoportok lekérése nem sikerült:", error);
      res.json({ tracks: [] });
    }
  });

  app.put("/api/html-files/:id/tracks", isAuthenticatedAdmin, async (req, res) => {
    const tracks = normalizeTracks((req.body as { tracks?: unknown } | undefined)?.tracks);
    if (!tracks) return res.status(400).json({ message: "Ismeretlen tananyagcsoport" });
    try {
      // Review #582: a csoport anyaga a csoport tartalmi évfolyamán van (gimi6 → 6.); eltérésnél 400, a tagság nem mentődik.
      const grades = [...new Set(tracks.map((t) => trackOption(t)!.contentGrade))];
      const { rowCount } = await pool.query(
        `UPDATE html_files SET tracks = $2::text[] WHERE id = $1 AND (cardinality($3::int[]) = 0 OR classroom = ALL($3::int[]))`,
        [req.params.id, tracks, grades]);
      if (!rowCount) {
        const exists = await pool.query(`SELECT 1 FROM html_files WHERE id = $1`, [req.params.id]);
        if (!exists.rowCount) return res.status(404).json({ message: "Nincs ilyen tananyag" });
        return res.status(400).json({ message: `A csoport anyagának ${grades.join(", ")}. osztályosnak kell lennie — előbb az évfolyamot állítsd át.` });
      }
      await invalidateFiles();
      res.json({ id: req.params.id, tracks });
    } catch (error) {
      logger.error("[tracks] a csoporttagság mentése nem sikerült:", error);
      res.status(500).json({ message: "A mentés nem sikerült" });
    }
  });
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  app.get("/api/admin/track-assignments", isAuthenticatedAdmin, async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const { rows } = await pool.query<{ track: string; email_key: string; created_at: Date }>(
        `SELECT track, email_key, created_at FROM track_assignments ORDER BY track, email_key`);
      res.json(rows.filter((r) => isTrackId(r.track)).map((r) => ({ track: r.track, emailKey: r.email_key, createdAt: r.created_at })));
    } catch (error) {
      logger.error("[tracks] a hozzárendelések lekérése nem sikerült:", error);
      res.status(500).json({ message: "A lekérés nem sikerült" });
    }
  });

  app.post("/api/admin/track-assignments", isAuthenticatedAdmin, async (req, res) => {
    const body = (req.body ?? {}) as { track?: unknown; email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!isTrackId(body.track)) return res.status(400).json({ message: "Ismeretlen tananyagcsoport" });
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ message: "Érvénytelen e-mail-cím" });
    const emailKey = accountEmailKey(email);
    try {
      await pool.query(`INSERT INTO track_assignments (track, email_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [body.track, emailKey]);
      res.json({ track: body.track, emailKey });
    } catch (error) {
      logger.error("[tracks] a hozzárendelés mentése nem sikerült:", error);
      res.status(500).json({ message: "A mentés nem sikerült" });
    }
  });

  app.delete("/api/admin/track-assignments", isAuthenticatedAdmin, async (req, res) => {
    const body = (req.body ?? {}) as { track?: unknown; emailKey?: unknown };
    if (!isTrackId(body.track) || typeof body.emailKey !== "string" || !body.emailKey) return res.status(400).json({ message: "Hiányos kérés" });
    try {
      const { rowCount } = await pool.query(`DELETE FROM track_assignments WHERE track = $1 AND email_key = $2`, [body.track, body.emailKey]);
      res.json({ deleted: rowCount ?? 0 });
    } catch (error) {
      logger.error("[tracks] a hozzárendelés törlése nem sikerült:", error);
      res.status(500).json({ message: "A törlés nem sikerült" });
    }
  });
}
