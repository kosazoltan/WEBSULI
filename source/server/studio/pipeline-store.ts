/**
 * A tananyaggyártás adattára (docs/specs/2026-10-16-egy-futas.md, S4b): a térkép betöltése, a job mentése, a lecke mentése és
 * közzététele. A régi lépésgépből (`step-runner.ts`) változatlan lekérdezésekkel áthelyezve; csak az egyfutásos motor által
 * használt műveletek maradtak. A `db` lustán töltődik: a modul importja nem nyithat adatbázis-kapcsolatot.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { gameQuizItems, htmlFiles, kmConcepts, knowledgeMaps, lessons, studioJobs, type InsertGameQuizItem } from "../../shared/schema";
import type { ExamWeight } from "../../shared/knowledge-map-schema";
import { getHtmlFilesCache } from "../cache/HtmlFilesCache";
import { workflowFence, workflowSerialized } from "../workflows/engine";
import type { Coverage, MapConcept } from "./coverage";
import type { StudioStep } from "./pipeline";

/** Spec 2026-09-19: csak a forrásból igazolt (megtartott / szerkesztett) fogalmak taníthatók. */
export const TAUGHT_REVIEW_STATES = ["kept", "edited"] as const;

/**
 * The html_files row of a published lesson carries no real HTML: the Preview page detects
 * `contentType:'lesson'` and mounts the lesson runtime instead of the iframe. This stub is
 * what an old client or a crawler would see.
 */
export const LESSON_PLACEHOLDER_HTML =
  '<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>Websuli lecke</title></head>' +
  "<body><p>Ezt a leckét a Websuli lecke-futtató jeleníti meg. Nyisd meg a websuli.vip oldalon.</p></body></html>";

export type MapMeta = {
  id: string; title: string; subject: string; classroom: number;
  /** Spec 2026-09-24: a kivonatolt forrásszöveg a vak megoldóhoz (a lektor független bizonyítéka). */
  sourceText?: string | null;
};

/** What the deterministic gate hands to the store when a lesson passes. */
export type PublishInput = {
  lessonId: string;
  mapId: string;
  title: string;
  classroom: number;
  coverage: Coverage;
  quizItems: InsertGameQuizItem[];
  /**
   * Review #155: a tanári kérés forrásból igazolt kiegészítő fogalmai tartósan a térképre kerülnek (`extra` súllyal — más
   * jobok fedettségét nem terhelik), hogy a lecke `instr-*` címkéit a későbbi javítás is ismerje.
   */
  extraConcepts?: MapConcept[];
};

export type JobPatch = Partial<{
  step: StudioStep;
  status: string;
  round: number;
  output: Record<string, unknown> | null;
  model: string | null;
  promptVersion: string | null;
  inputHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
  error: string | null;
  finishedAt: Date | null;
  lessonId: string | null;
}>;

/** A gyártás adattára — a motor ezeket a műveleteket használja; a tesztek memóriabeli megvalósítást adnak. */
export type PipelineStore = {
  loadMap(mapId: string): Promise<{ meta: MapMeta; concepts: MapConcept[] } | null>;
  saveStep(jobId: string, patch: JobPatch): Promise<void>;
  /** Insert a new lessons row, or overwrite the existing one. */
  upsertLesson(lessonId: string | null, mapId: string, json: unknown): Promise<string>;
  /**
   * Audit 2026-09-05 (gate): make the lesson reachable for a child — html_files row (`contentType:'lesson'`), publishedAt + coverage
   * snapshot on the lessons row, and the concept-bound checks exported to the coupon games (idempotent per lesson).
   */
  publishLesson(input: PublishInput): Promise<{ htmlFileId: string; exportedQuizItems: number }>;
  createJob(input: { mapId: string; step: "pedagogue"; status: string; model: string; promptVersion: string; inputHash: string }): Promise<string>;
};

export async function createDrizzlePipelineStore(): Promise<PipelineStore> {
  const { db } = await import("../db");

  return {
    async loadMap(mapId) {
      const [map] = await db
        .select({
          id: knowledgeMaps.id,
          title: knowledgeMaps.title,
          subject: knowledgeMaps.subject,
          classroom: knowledgeMaps.classroom,
          sourceText: knowledgeMaps.sourceText,
        })
        .from(knowledgeMaps)
        .where(eq(knowledgeMaps.id, mapId))
        .limit(1);
      if (!map) return null;

      // #174: a kihúzott (rejected) fogalom nem tananyag — a vázlat-lefedettség
      // és a fogalom-javítás sem követelheti.
      const concepts = await db
        // #196: a `term` KELL a megalapozottság-ellenőrzéshez (grounding.ts) —
        // enélkül a kapu némán nem mérne semmit, ami pontosan az a hazug-kapu
        // minta, amit ez a jegy megszüntet.
        .select({
          id: kmConcepts.id,
          localId: kmConcepts.localId,
          term: kmConcepts.term,
          definition: kmConcepts.definition,
          quote: kmConcepts.quote,
          examWeight: kmConcepts.examWeight,
        })
        .from(kmConcepts)
        // Spec 2026-09-19: only source-verified concepts are taught. A manually approved
        // map never holds `pending` (canApprove); an autonomously approved one may — those
        // stay visible in the map but do not reach the pedagogue/author.
        .where(and(eq(kmConcepts.mapId, mapId), inArray(kmConcepts.reviewState, TAUGHT_REVIEW_STATES)))
        // Spec 2026-10-15-tetelgyar T0.1: a fogalmak a lektor-bizonyíték és a lépés-lenyomatok bemenete — determinisztikus sorrend
        // (mérve: a rendezetlen lekérdezés sorrendje eltért a rendezettől).
        .orderBy(asc(kmConcepts.orderIndex), asc(kmConcepts.id));

      return {
        // Spec 2026-09-24: a forrásszöveg a vak megoldóhoz kell (élő mérés: nélküle a vak megoldó nem futott).
        meta: { id: map.id, title: map.title, subject: map.subject, classroom: map.classroom, sourceText: map.sourceText },
        concepts: concepts.map((c) => ({
          id: c.id,
          localId: c.localId,
          term: c.term,
          definition: c.definition,
          quote: c.quote,
          examWeight: c.examWeight as ExamWeight,
        })),
      };
    },

    async saveStep(jobId, patch) {
      // Review #263: a folytatás ugyanazt a jobot írja — a lejárt lízingű (elavult) végrehajtó nem írhatja felül az új futás mentését.
      // Workflow-kontextuson kívül a kerítés nem vizsgál.
      // Review #265: a workflow-mentésekkel közös sorban (párhuzamos bankcsomagok mellett sincs revízió-verseny).
      await workflowSerialized(() => db.transaction(async (tx) => {
        await workflowFence(tx);
        await tx.update(studioJobs).set(patch).where(eq(studioJobs.id, jobId));
      }));
    },

    async publishLesson(input) {
      // Audit 2026-09-05 (A): one transaction — a lesson is either fully reachable
      // (html_files row + publishedAt + quiz export) or untouched.
      // B6: re-publish keeps the existing htmlFileId so old /preview links stay valid.
      const result = await db.transaction(async (tx) => {
        await workflowFence(tx);
        const [existing] = await tx
          .select({ htmlFileId: lessons.htmlFileId })
          .from(lessons)
          .where(eq(lessons.id, input.lessonId))
          .limit(1);

        let fileId = existing?.htmlFileId ?? null;
        if (fileId) {
          await tx
            .update(htmlFiles)
            .set({
              title: input.title,
              description: "Websuli lecke — a lecke-futtató jeleníti meg.",
              classroom: input.classroom,
              contentType: "lesson",
            })
            .where(eq(htmlFiles.id, fileId));
        } else {
          const [file] = await tx
            .insert(htmlFiles)
            .values({
              title: input.title,
              content: LESSON_PLACEHOLDER_HTML,
              description: "Websuli lecke — a lecke-futtató jeleníti meg.",
              classroom: input.classroom,
              contentType: "lesson",
            })
            .returning({ id: htmlFiles.id });
          fileId = file.id;
        }

        await tx
          .update(lessons)
          .set({
            htmlFileId: fileId,
            publishedAt: new Date(),
            coverage: input.coverage as never,
            updatedAt: new Date(),
          })
          .where(eq(lessons.id, input.lessonId));
        // Csak a még hiányzó sor kerül be (NOT EXISTS) — a meglévő fogalomhoz kötött játékelemek érintetlenek maradnak.
        for (const [i, c] of (input.extraConcepts ?? []).entries()) {
          await tx.execute(sql`insert into km_concepts (map_id, local_id, term, definition, quote, source_ref, type, exam_weight, verbatim_ok, review_state, order_index)
            select ${input.mapId}, ${c.localId}, ${(c.term ?? c.localId).slice(0, 200)}, ${c.definition ?? c.term ?? ""}, ${c.quote ?? ""},
              ${JSON.stringify({ file: "tanári kérés (forrásból igazolt)" })}::jsonb, 'fact', 'extra', true, 'kept', ${10_000 + i}
            where not exists (select 1 from km_concepts where map_id = ${input.mapId} and local_id = ${c.localId})`);
        }
        // Idempotent re-publish: the previous export of this lesson goes first.
        await tx.delete(gameQuizItems).where(eq(gameQuizItems.lessonId, input.lessonId));
        if (input.quizItems.length > 0) {
          await tx
            .insert(gameQuizItems)
            .values(input.quizItems.map((q) => ({ ...q, sourceMaterialId: fileId })));
        }
        await workflowFence(tx);
        return { htmlFileId: fileId, exportedQuizItems: input.quizItems.length };
      });
      // A lista-cache a GET /api/html-files előtt áll. Invalidálás CSAK a sikeres
      // commit után: különben az előnézet (/preview/:id) működik, a főoldal/Fájlok
      // lista pedig 5 percig a régi sort szolgálja.
      getHtmlFilesCache().invalidate();
      return result;
    },

    async upsertLesson(lessonId, mapId, json) {
      if (lessonId) {
        await db.update(lessons).set({ json: json as never, updatedAt: new Date() }).where(eq(lessons.id, lessonId));
        return lessonId;
      }
      const [row] = await db.insert(lessons).values({ mapId, json: json as never }).returning({ id: lessons.id });
      return row.id;
    },

    async createJob(input) {
      const [row] = await db
        .insert(studioJobs)
        .values({
          mapId: input.mapId,
          step: input.step,
          status: input.status,
          model: input.model,
          promptVersion: input.promptVersion,
          inputHash: input.inputHash,
        })
        .returning({ id: studioJobs.id });
      return row.id;
    },
  };
}
