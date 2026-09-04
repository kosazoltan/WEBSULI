import express, { type Request, type Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "../db";
import { knowledgeMaps, kmConcepts } from "../../shared/schema";
import { isAuthenticatedAdmin } from "../auth";
import { logger } from "../lib/logger";
import {
  EXAM_WEIGHTS,
  REVIEW_STATES,
} from "../../shared/knowledge-map-schema";
import {
  applyVerbatimChecks,
  canApprove,
  computeInputHash,
  type ExtractorFile,
} from "./extractor";
import {
  buildConceptUpdate,
  parseConceptPatch,
  parseExtractRequest,
} from "./request";
import {
  LEGACY_MODELS,
  STUDIO_STEPS,
  aiKeyStatus,
  assertDistinctFamilies,
  effortFor,
  modelFamily,
  providerForModel,
  requiredKeyFor,
  resolveLegacyModel,
  studioModelMap,
} from "../ai/models";

/**
 * Lesson Studio — KnowledgeMap endpoints (LS-1).
 *
 * Kept in its own router rather than routes.ts (already 5.6k lines) so the Studio
 * surface stays reviewable as LS-2..LS-5 land.
 *
 * Everything here is admin-only: extraction spends money on a vision model, and an
 * approved map is what later bounds what pupils are taught.
 */

export const studioRouter = express.Router();

studioRouter.use(isAuthenticatedAdmin);

/**
 * Concept rows as the approval gate wants them.
 *
 * The DB stores examWeight/reviewState as plain varchar; canApprove() speaks the union
 * types. One narrowing helper instead of the same six-line cast at three call sites.
 */
function forApprovalGate(
  rows: Array<{ id: string; examWeight: string; verbatimOk: boolean; reviewState: string }>,
) {
  return rows.map((r) => ({
    id: r.id,
    examWeight: r.examWeight as (typeof EXAM_WEIGHTS)[number],
    verbatimOk: r.verbatimOk,
    reviewState: r.reviewState as (typeof REVIEW_STATES)[number],
  }));
}

/** Map a DB concept row onto the shape the editor consumes. */
function toClientConcept(row: typeof kmConcepts.$inferSelect) {
  return {
    id: row.id,
    localId: row.localId,
    term: row.term,
    definition: row.definition,
    quote: row.quote,
    sourceRef: row.sourceRef,
    type: row.type,
    examWeight: row.examWeight,
    relatedIds: row.relatedIds,
    verbatimOk: row.verbatimOk,
    verbatimReason: row.verbatimReason,
    reviewState: row.reviewState,
    orderIndex: row.orderIndex,
  };
}

/**
 * GET /api/studio/ai-status — melyik AI-funkció tud egyáltalán elindulni.
 *
 * Azért létezik, mert 2026-09-04-én az éles rendszerben EGYETLEN AI-kulcs sem volt
 * beállítva, és ezt semmi nem mondta meg: a route-ok felépítették az SDK-klienst, és az
 * első admin-kattintás nyers szolgáltatói hibát kapott. Egy „miért nem működik" kérdésre
 * a válasznak egy lekérdezésnyire kell lennie.
 *
 * A kulcsok ÉRTÉKE soha nem hagyja el a szervert — csak a jelenlét, a modell-hozzárendelés
 * és a hiányzó kulcs miatt kieső funkciók listája.
 */
studioRouter.get("/ai-status", async (_req: Request, res: Response) => {
  const keys = aiKeyStatus();
  const studio = studioModelMap();

  let d1Independent = true;
  let d1Message = "";
  try {
    assertDistinctFamilies();
  } catch (error) {
    d1Independent = false;
    d1Message = (error as Error).message;
  }

  res.json({
    keys,
    legacyTasks: (Object.keys(LEGACY_MODELS) as (keyof typeof LEGACY_MODELS)[]).map((task) => {
      const value: string | readonly string[] = LEGACY_MODELS[task];
      return {
        task,
        model: resolveLegacyModel(task),
        fallbacks: Array.isArray(value) ? value.slice(1) : [],
        effort: effortFor(task) ?? null,
        requiredKey: requiredKeyFor(task),
        ready: keys[providerForModel(resolveLegacyModel(task))].configured,
      };
    }),
    studioSteps: STUDIO_STEPS.map((step) => ({
      step,
      model: studio[step],
      family: modelFamily(studio[step]),
      ready: keys.openrouter.configured,
    })),
    d1: { independentLektor: d1Independent, message: d1Message },
  });
});

/** GET /api/studio/maps — list maps for the admin overview. */
studioRouter.get("/maps", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: knowledgeMaps.id,
      title: knowledgeMaps.title,
      subject: knowledgeMaps.subject,
      classroom: knowledgeMaps.classroom,
      unit: knowledgeMaps.unit,
      status: knowledgeMaps.status,
      createdAt: knowledgeMaps.createdAt,
      updatedAt: knowledgeMaps.updatedAt,
    })
    .from(knowledgeMaps)
    .orderBy(desc(knowledgeMaps.updatedAt))
    .limit(200);

  res.json({ maps: rows });
});

/** GET /api/studio/maps/:id — one map with its concepts, ordered for review. */
studioRouter.get("/maps/:id", async (req: Request, res: Response) => {
  const [map] = await db
    .select()
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.id, req.params.id))
    .limit(1);

  if (!map) return res.status(404).json({ message: "A térkép nem található." });

  const concepts = await db
    .select()
    .from(kmConcepts)
    .where(eq(kmConcepts.mapId, map.id))
    .orderBy(asc(kmConcepts.orderIndex), asc(kmConcepts.term));

  const gate = canApprove(forApprovalGate(concepts));

  res.json({
    map: {
      id: map.id,
      title: map.title,
      subject: map.subject,
      classroom: map.classroom,
      unit: map.unit,
      status: map.status,
      sourceFiles: map.sourceFiles,
      model: map.model,
      approvedAt: map.approvedAt,
      createdAt: map.createdAt,
      updatedAt: map.updatedAt,
    },
    concepts: concepts.map(toClientConcept),
    approval: gate,
  });
});

/**
 * POST /api/studio/maps/extract — build (or reuse) a map from uploaded sources.
 *
 * Idempotent by content: the same files with the same scope return the stored map
 * instead of paying for the vision call twice.
 */
studioRouter.post("/maps/extract", async (req: Request, res: Response) => {
  const parsed = parseExtractRequest(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: "Hibás kérés.", issues: parsed.issues });
  }

  const { files, scope, title } = parsed.data;
  const inputHash = computeInputHash(files, scope);

  const [existing] = await db
    .select({ id: knowledgeMaps.id })
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.inputHash, inputHash))
    .limit(1);

  if (existing) {
    logger.info(`[STUDIO] Kivonatolás gyorsítótárból: ${existing.id}`);
    return res.json({ mapId: existing.id, cached: true });
  }

  const { runExtraction } = await import("./run-extraction");
  try {
    const mapId = await runExtraction({
      files: files as ExtractorFile[],
      scope,
      title,
      inputHash,
      userId: (req.user as { id?: string } | undefined)?.id,
    });
    res.status(201).json({ mapId, cached: false });
  } catch (error) {
    logger.error(
      `[STUDIO] Kivonatolás hiba: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(502).json({ message: "A kivonatolás nem sikerült. Próbáld újra." });
  }
});

/**
 * PATCH /api/studio/concepts/:id — teacher curation.
 *
 * When the quote changes the verbatim check is re-run server-side. The client's
 * opinion about verbatimOk is never trusted: that flag is what protects D1.
 */
studioRouter.patch("/concepts/:id", async (req: Request, res: Response) => {
  const parsed = parseConceptPatch(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: "Hibás mező.", issues: parsed.issues });
  }

  const [concept] = await db
    .select()
    .from(kmConcepts)
    .where(eq(kmConcepts.id, req.params.id))
    .limit(1);

  if (!concept) return res.status(404).json({ message: "A fogalom nem található." });

  const [map] = await db
    .select({ id: knowledgeMaps.id, status: knowledgeMaps.status, sourceText: knowledgeMaps.sourceText })
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.id, concept.mapId))
    .limit(1);

  if (map?.status === "approved") {
    return res
      .status(409)
      .json({ message: "Jóváhagyott térkép fogalma nem módosítható." });
  }

  // A verbatimOk-ot mindig a szerver számolja a tárolt forrásszövegből (D1) —
  // a kliens nem hitelesítheti a saját állítását.
  const update = buildConceptUpdate(
    parsed.data as Record<string, unknown>,
    map?.sourceText ?? "",
  );

  const [saved] = await db
    .update(kmConcepts)
    .set(update as Partial<typeof kmConcepts.$inferInsert>)
    .where(eq(kmConcepts.id, concept.id))
    .returning();

  res.json({ concept: toClientConcept(saved) });
});

/**
 * POST /api/studio/maps/:id/approve — the coverage gate.
 *
 * Refuses while a core concept cannot be traced to the source, or while anything is
 * still unreviewed. The check runs on DB state, not on what the client claims.
 */
studioRouter.post("/maps/:id/approve", async (req: Request, res: Response) => {
  const [map] = await db
    .select()
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.id, req.params.id))
    .limit(1);

  if (!map) return res.status(404).json({ message: "A térkép nem található." });

  const concepts = await db
    .select({
      id: kmConcepts.id,
      examWeight: kmConcepts.examWeight,
      verbatimOk: kmConcepts.verbatimOk,
      reviewState: kmConcepts.reviewState,
    })
    .from(kmConcepts)
    .where(eq(kmConcepts.mapId, map.id));

  const gate = canApprove(forApprovalGate(concepts));

  if (!gate.ok) return res.status(409).json({ message: gate.reason });

  const [saved] = await db
    .update(knowledgeMaps)
    .set({
      status: "approved",
      approvedBy: (req.user as { id?: string } | undefined)?.id ?? null,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeMaps.id, map.id))
    .returning({ id: knowledgeMaps.id, status: knowledgeMaps.status, approvedAt: knowledgeMaps.approvedAt });

  logger.info(`[STUDIO] Térkép jóváhagyva: ${saved.id}`);
  res.json({ map: saved });
});

/** POST /api/studio/maps/:id/recheck — re-run D1 over every concept. */
studioRouter.post("/maps/:id/recheck", async (req: Request, res: Response) => {
  const [map] = await db
    .select({ id: knowledgeMaps.id, sourceText: knowledgeMaps.sourceText })
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.id, req.params.id))
    .limit(1);

  if (!map) return res.status(404).json({ message: "A térkép nem található." });

  const concepts = await db.select().from(kmConcepts).where(eq(kmConcepts.mapId, map.id));

  const checked = applyVerbatimChecks(
    concepts.map((c) => ({ id: c.id, quote: c.quote, examWeight: c.examWeight as (typeof EXAM_WEIGHTS)[number] })),
    map.sourceText ?? "",
  );

  await Promise.all(
    checked.map((c) =>
      db
        .update(kmConcepts)
        .set({
          verbatimOk: c.verbatimOk,
          verbatimReason: c.verbatimOk ? null : (c.verbatimReason ?? null),
          updatedAt: new Date(),
        })
        .where(eq(kmConcepts.id, c.id)),
    ),
  );

  res.json({
    checked: checked.length,
    failing: checked.filter((c) => !c.verbatimOk).length,
  });
});

/** DELETE /api/studio/maps/:id — drafts only; concepts cascade. */
studioRouter.delete("/maps/:id", async (req: Request, res: Response) => {
  const deleted = await db
    .delete(knowledgeMaps)
    .where(and(eq(knowledgeMaps.id, req.params.id), eq(knowledgeMaps.status, "draft")))
    .returning({ id: knowledgeMaps.id });

  if (deleted.length === 0) {
    return res
      .status(409)
      .json({ message: "Csak piszkozat státuszú térkép törölhető." });
  }

  res.json({ deleted: deleted[0].id });
});
