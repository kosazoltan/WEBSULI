import { DESIGN_ASSET_CATALOG } from "./design-asset-catalog";
import { lessonArtIds, pickLessonArt, type DesignAsset, type StoredLessonArt } from "./design-assets";
import { topicCoverId, topicKeyOf } from "./topic-taxonomy";
import { designThemeForClassroom } from "./lesson-design";
import { isLessonCoverId, lessonCoverId } from "./lesson-cover";

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
  /** Spec 2026-11-03-leckeborito: a lecke korábbi `art.picture`-je — a kézzel beállított leckeborító mentéskor megmarad. */
  pinned?: unknown,
): ComputedLessonArt | null {
  if (typeof lesson.subject !== "string" || typeof lesson.classroom !== "number" || typeof lesson.title !== "string") return null;
  const available = catalog.filter(a => storedIds.has(a.id));
  const topic = topicKeyOf({ subject: lesson.subject, classroom: lesson.classroom, title: lesson.title });
  const band = designThemeForClassroom(lesson.classroom);
  const picked = pickLessonArt({ subject: lesson.subject, title: lesson.title, seed, topicCoverId: topic ? topicCoverId(topic) : null }, band, available);
  const art: ComputedLessonArt = lessonArtIds(picked);
  // Spec 2026-11-03-leckeborito-auto: kurált (kulcsszavas vagy katalógusos) borító híján a táblában gyártott tartalomkulcsú borító nyer.
  const key = lessonCoverId({ subject: lesson.subject, title: lesson.title }, band);
  if (!(picked.cover && !picked.cover.topic) && storedIds.has(key)) art.picture = key;
  // A kézi leckeborító (cover-l-*) marad, ha a táblában megvan és a lecke mostani sávjáé (más korosztálynak nem illő stílus lenne);
  // a katalógusban nem szereplő (gyártott) kép csak azonos tartalomkulccsal.
  if (typeof pinned === "string" && isLessonCoverId(pinned) && (available.some(a => a.id === pinned && a.kind === "cover" && a.band === band)
    || (pinned === key && storedIds.has(pinned)))) art.picture = pinned;
  if (topic) art.topic = topic.key;
  return art;
}
