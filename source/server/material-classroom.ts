/**
 * Következetes évfolyam-módosítás (docs/specs/2026-11-16-tananyag-evfolyam-modositas.md): egy tananyag évfolyama a
 * `html_files.classroom` mellett Studio-leckénél a lecke adatában (`lessons.json.classroom`) és a forrásjegyzékben
 * (`knowledge_maps.classroom`) is tárolódik. Az admin minden évfolyam-írása ezen megy át, egy tranzakcióban.
 *
 * 0-s kategória (`legacyClassroom`, server/studio/pipeline-store.ts): 0-ra állításkor csak a `html_files` változik — a lecke
 * és a forrásjegyzék a tartalmi évfolyamot tartja (a Stúdió korosztály-regisztere abból számol).
 */
import { and, eq, inArray } from "drizzle-orm";
import { htmlFiles, improvedHtmlFiles, knowledgeMaps, lessons, studioJobs } from "../shared/schema";
import { isValidClassroom } from "../shared/classrooms";
import { withLessonArt } from "./design-assets";
import { db } from "./db";

/** A tananyag-azonosítók meglévő formái: UUID és a régi (nanoid-szerű) azonosító. */
export const MATERIAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class MaterialClassroomError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409) {
    super(message);
    this.name = "MaterialClassroomError";
  }
}

/** Trim, üres kiszűrve, ismétlődés nélkül, az első előfordulás sorrendjében. */
export function normalizeMaterialIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type MaterialClassroomResult = { files: number; lessons: number; maps: number };

export async function setMaterialClassroomTx(tx: Tx, rawIds: readonly string[], classroom: number): Promise<MaterialClassroomResult> {
  if (!isValidClassroom(classroom)) throw new MaterialClassroomError("Az osztály értékének 0 és 12 között kell lennie", 400);
  const ids = normalizeMaterialIds(rawIds);
  if (!ids.length) throw new MaterialClassroomError("Legalább egy tananyag kötelező", 400);
  if (ids.some((id) => !MATERIAL_ID_PATTERN.test(id))) throw new MaterialClassroomError("Érvénytelen tananyag-azonosító", 400);

  const files = await tx.select({ id: htmlFiles.id }).from(htmlFiles).where(inArray(htmlFiles.id, ids)).for("update");
  if (files.length !== ids.length) throw new MaterialClassroomError(`${ids.length - files.length} tananyag nem található`, 404);

  const improving = await tx.select({ id: improvedHtmlFiles.id }).from(improvedHtmlFiles)
    .where(and(inArray(improvedHtmlFiles.originalFileId, ids), eq(improvedHtmlFiles.status, "processing")));
  if (improving.length) throw new MaterialClassroomError("Egy kijelölt tananyag okosítása folyamatban van; várd meg a végét.", 409);

  const rows = await tx.select({ id: lessons.id, mapId: lessons.mapId, json: lessons.json, version: lessons.version })
    .from(lessons).where(inArray(lessons.htmlFileId, ids)).for("update");
  if (rows.length) {
    const active = await tx.select({ id: studioJobs.id }).from(studioJobs)
      .where(and(inArray(studioJobs.lessonId, rows.map((r) => r.id)), inArray(studioJobs.status, ["queued", "running", "processing"])));
    if (active.length) throw new MaterialClassroomError("Egy kijelölt lecke gyártása még fut; várd meg a befejezését.", 409);
  }

  let lessonWrites = 0;
  let mapWrites = 0;
  if (classroom !== 0 && rows.length) {
    const mapIds = [...new Set(rows.map((r) => r.mapId))];
    const users = await tx.select({ mapId: lessons.mapId, htmlFileId: lessons.htmlFileId }).from(lessons).where(inArray(lessons.mapId, mapIds));
    if (users.some((u) => u.htmlFileId !== null && !ids.includes(u.htmlFileId))) {
      throw new MaterialClassroomError("A lecke forrásjegyzékét egy másik tananyag is használja; az évfolyamot együtt kell áthelyezni.", 409);
    }
    for (const row of rows) {
      // A tárolt leckét nem validáljuk újra (egy régebbi sémájú lecke is áthelyezhető); csak az évfolyam és az arculat változik.
      if (!row.json || typeof row.json !== "object" || Array.isArray(row.json)) throw new MaterialClassroomError("A lecke adata hibás; az évfolyam nem módosítható.", 409);
      const current = row.json as Record<string, unknown>;
      if (current.classroom === classroom) continue;
      // Az új sáv arculata (téma, ikon); a meglévő borítókép megmarad — ugyanaz, mint a javító út (structured-improvement).
      const candidate = await withLessonArt({ ...current, classroom }, row.id, tx);
      await tx.update(lessons).set({ json: candidate, version: row.version + 1, updatedAt: new Date() }).where(eq(lessons.id, row.id));
      lessonWrites++;
    }
    const maps = await tx.select({ id: knowledgeMaps.id, classroom: knowledgeMaps.classroom }).from(knowledgeMaps).where(inArray(knowledgeMaps.id, mapIds));
    for (const map of maps) {
      if (map.classroom === classroom) continue;
      await tx.update(knowledgeMaps).set({ classroom, updatedAt: new Date() }).where(eq(knowledgeMaps.id, map.id));
      mapWrites++;
    }
  }

  const moved = await tx.update(htmlFiles).set({ classroom }).where(inArray(htmlFiles.id, ids)).returning({ id: htmlFiles.id });
  return { files: moved.length, lessons: lessonWrites, maps: mapWrites };
}

export function setMaterialClassroom(ids: readonly string[], classroom: number): Promise<MaterialClassroomResult> {
  return db.transaction((tx) => setMaterialClassroomTx(tx, ids, classroom));
}
