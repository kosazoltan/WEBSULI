import { Router } from "express";
import { isAuthenticatedAdmin } from "../auth";
import { logger } from "../lib/logger";
import { cardFromRow } from "./store";
import { codeEntry, statusAt, type MemoryStatus } from "./subject-memory";

/**
 * Spec 2026-10-06-s5-tantargyi-memoria: a tantárgyi memória CSAK OLVASÓ admin API-ja. A státusz olvasáskor újraszámolt (lecsengés).
 * Írás (kézi lezárás, összefoglaló jóváhagyása) és admin-felület külön szelet.
 */
export const subjectMemoryAdminRouter = Router();
subjectMemoryAdminRouter.use(isAuthenticatedAdmin);

const COLUMNS = "fingerprint,subject,step,code,occurrences,first_seen,last_seen,status,evidence,corrective_summary,corrective_at,corrective_count";
const PAGE = 500;
const pool = async () => (await import("../db")).dbPool;

subjectMemoryAdminRouter.get("/summary", async (_req, res) => {
  try {
    const now = Date.now();
    const { rows } = await (await pool()).query(`SELECT ${COLUMNS} FROM subject_memory_cards`);
    const subjects: Record<string, Record<MemoryStatus | "total", number>> = {};
    for (const card of rows.map(cardFromRow)) {
      const s = (subjects[card.subject] ??= { total: 0, open: 0, watch: 0, closed: 0 });
      s[statusAt(card, now)]++;
      s.total++;
    }
    res.json({ subjects });
  } catch (error) {
    logger.error("[memory] summary", error);
    res.status(500).json({ error: "A tantárgyi memória összesítése nem érhető el." });
  }
});

subjectMemoryAdminRouter.get("/cards", async (req, res) => {
  try {
    const subject = typeof req.query.subject === "string" ? req.query.subject.slice(0, 32) : null;
    const status = typeof req.query.status === "string" && ["open", "watch", "closed"].includes(req.query.status) ? req.query.status as MemoryStatus : null;
    const { rows } = await (await pool()).query(`SELECT ${COLUMNS} FROM subject_memory_cards ${subject ? "WHERE subject = $1" : ""}
      ORDER BY subject, occurrences DESC, last_seen DESC, fingerprint`, subject ? [subject] : []);
    const now = Date.now();
    const cards = rows.map(cardFromRow).map((c) => {
      const entry = codeEntry(c.code, c.step);
      return { ...c, status: statusAt(c, now), title: entry?.title ?? null, injectableFor: entry?.roles ?? [] };
    }).filter((c) => !status || c.status === status);
    res.json({ cards: cards.slice(0, PAGE), total: cards.length, limit: PAGE });
  } catch (error) {
    logger.error("[memory] cards", error);
    res.status(500).json({ error: "A memória-kártyák nem érhetők el." });
  }
});
