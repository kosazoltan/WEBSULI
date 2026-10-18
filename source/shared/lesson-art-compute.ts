import { DESIGN_ASSET_CATALOG } from "./design-asset-catalog";
import { lessonArtIds, pickLessonArt, type DesignAsset, type StoredLessonArt } from "./design-assets";
import { topicCoverId, topicKeyOf } from "./topic-taxonomy";
import { designThemeForClassroom } from "./lesson-design";

/**
 * A mentéskori arculatválasztás tiszta magja (docs/specs/2026-10-18-arculat-backfill.md): a `withLessonArt` és a backfill-szkript
 * ugyanezt hívja. Csak az adatbázisban meglévő elemek (`storedIds`) közül választ. Érvénytelen lecke: null.
 */
export type ComputedLessonArt = StoredLessonArt & { topic?: string };

export function computeLessonArt(
  lesson: { subject?: unknown; classroom?: unknown; title?: unknown },
  seed: string,
  storedIds: ReadonlySet<string>,
  catalog: readonly DesignAsset[] = DESIGN_ASSET_CATALOG,
): ComputedLessonArt | null {
  if (typeof lesson.subject !== "string" || typeof lesson.classroom !== "number" || typeof lesson.title !== "string") return null;
  const available = catalog.filter(a => storedIds.has(a.id));
  const topic = topicKeyOf({ subject: lesson.subject, classroom: lesson.classroom, title: lesson.title });
  const art: ComputedLessonArt = lessonArtIds(pickLessonArt({ subject: lesson.subject, title: lesson.title, seed, topicCoverId: topic ? topicCoverId(topic) : null }, designThemeForClassroom(lesson.classroom), available));
  if (topic) art.topic = topic.key;
  return art;
}
