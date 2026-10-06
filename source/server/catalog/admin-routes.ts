import { Router } from "express";
import { and, asc, count, desc, eq, gte, ne } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticatedAdmin } from "../auth";
import { catalogItemOutcomes, catalogItems, catalogLessons } from "../../shared/schema";
import { logger } from "../lib/logger";

/**
 * Spec 2026-10-05-s3-katalogus-bank: a tantárgyi katalógus-bankok CSAK OLVASÓ admin-nézete. Bankonkénti darab státusz szerint, az
 * átnézendő (eltérő/hiányzó besorolású) leckék és a jelölt tételek. A döntő felület (elfogad / elutasít / áthelyez) külön szelet.
 */
export const catalogAdminRouter = Router();
catalogAdminRouter.use(isAuthenticatedAdmin);

catalogAdminRouter.get("/summary", async (_req, res) => {
  try {
    const items = await db.select({ subject: catalogItems.subject, status: catalogItems.status, n: count() }).from(catalogItems).groupBy(catalogItems.subject, catalogItems.status);
    const lessons = await db.select({ status: catalogLessons.classificationStatus, n: count() }).from(catalogLessons).groupBy(catalogLessons.classificationStatus);
    // S8: bankonként hány tételnek van tanulói eredménye (a 0023 migráció előtt is működjön az összesítés).
    const measured = await db.select({ subject: catalogItems.subject, n: count() }).from(catalogItems)
      .innerJoin(catalogItemOutcomes, eq(catalogItemOutcomes.fingerprint, catalogItems.fingerprint)).groupBy(catalogItems.subject)
      .catch((error: unknown) => { logger.warn("[catalog] summary: a tételenkénti eredmény nem olvasható", error); return []; });
    const banks: Record<string, Record<string, number>> = {};
    for (const r of items) {
      const b = (banks[r.subject] ??= { total: 0, withOutcome: 0 });
      b[r.status] = Number(r.n);
      b.total += Number(r.n);
    }
    for (const r of measured) if (banks[r.subject]) banks[r.subject].withOutcome = Number(r.n);
    res.json({ banks, lessons: Object.fromEntries(lessons.map((l) => [l.status, Number(l.n)])) });
  } catch (error) {
    logger.error("[catalog] summary", error);
    res.status(500).json({ error: "A katalógus-összesítés nem érhető el." });
  }
});

const PAGE = 200;
catalogAdminRouter.get("/review", async (req, res) => {
  try {
    const subject = typeof req.query.subject === "string" ? req.query.subject.slice(0, 32) : null;
    const lessons = await db.select().from(catalogLessons).where(ne(catalogLessons.classificationStatus, "agreed")).orderBy(asc(catalogLessons.title));
    const flaggedWhere = subject ? and(eq(catalogItems.status, "flagged"), eq(catalogItems.subject, subject)) : eq(catalogItems.status, "flagged");
    const flagged = await db.select({
      id: catalogItems.id, subject: catalogItems.subject, grade: catalogItems.grade, kind: catalogItems.kind, prompt: catalogItems.prompt,
      options: catalogItems.options, correctIndex: catalogItems.correctIndex, checks: catalogItems.checks, provenances: catalogItems.provenances, trust: catalogItems.trust,
    }).from(catalogItems).where(flaggedWhere).orderBy(asc(catalogItems.subject), asc(catalogItems.grade)).limit(PAGE);
    res.json({ lessons, flagged, flaggedLimit: PAGE });
  } catch (error) {
    logger.error("[catalog] review", error);
    res.status(500).json({ error: "Az átnézési lista nem érhető el." });
  }
});

/** Spec 2026-10-06-s8-tanuloi-eredmenyesseg: tételenkénti helyes-arány (a legnehezebb elöl). Csak összesített szám. */
catalogAdminRouter.get("/outcomes", async (req, res) => {
  try {
    const subject = typeof req.query.subject === "string" ? req.query.subject.slice(0, 32) : null;
    const raw = Number(req.query.minAttempts);
    const minAttempts = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 1000) : 1;
    const where = subject ? and(gte(catalogItemOutcomes.attempts, minAttempts), eq(catalogItems.subject, subject)) : gte(catalogItemOutcomes.attempts, minAttempts);
    const items = await db.select({
      id: catalogItems.id, subject: catalogItems.subject, grade: catalogItems.grade, kind: catalogItems.kind, prompt: catalogItems.prompt,
      options: catalogItems.options, correctIndex: catalogItems.correctIndex, status: catalogItems.status, trust: catalogItems.trust, provenances: catalogItems.provenances,
      attempts: catalogItemOutcomes.attempts, correct: catalogItemOutcomes.correct, independentCorrect: catalogItemOutcomes.independentCorrect,
      rate: catalogItemOutcomes.rate, outcomeUpdatedAt: catalogItemOutcomes.updatedAt,
    }).from(catalogItems).innerJoin(catalogItemOutcomes, eq(catalogItemOutcomes.fingerprint, catalogItems.fingerprint))
      .where(where).orderBy(asc(catalogItemOutcomes.rate), desc(catalogItemOutcomes.attempts), asc(catalogItems.id)).limit(PAGE);
    res.json({ items, minAttempts, limit: PAGE });
  } catch (error) {
    logger.error("[catalog] outcomes", error);
    res.status(500).json({ error: "A tételenkénti eredmény nem érhető el." });
  }
});
