import { DESIGN_ASSET_CATALOG } from "./design-asset-catalog";
import { pickLessonArt, resolveStoredArt, type StoredLessonArt } from "./design-assets";
import { designThemeForClassroom } from "./lesson-design";

/**
 * Spec 2026-11-03-fooldal-boritokartyak (review #381): a főoldali kártya PONTOSAN azt a kezdőképet mutatja, amit a lecke-lejátszó
 * (`lessonArtFor`: a tárolt kép, ha az új szabály szerint is illik, különben friss választás; a sáv az évfolyamé, a seed a lecke
 * azonosítója). Csak a szerver használja — a képkatalógus így nem kerül a főoldal bundle-jébe.
 */
export function shownPictureId(lesson: { subject?: unknown; title?: unknown; classroom?: unknown; art?: unknown }, seed: string): string | null {
  if (typeof lesson.subject !== "string" || typeof lesson.title !== "string" || typeof lesson.classroom !== "number") return null;
  const meta = { subject: lesson.subject, title: lesson.title };
  const band = designThemeForClassroom(lesson.classroom);
  const art = resolveStoredArt(lesson.art as StoredLessonArt | undefined, band, DESIGN_ASSET_CATALOG, meta) ?? pickLessonArt({ ...meta, seed }, band, DESIGN_ASSET_CATALOG);
  return (art.cover ?? art.hero)?.id ?? null;
}

/**
 * Fájlonként a LEGÚJABB publikált lecke számít (a sorok `published_at` szerint csökkenőek), akkor is, ha annak nincs megjeleníthető
 * képe — egy régebbi lecke borítója nem kerülhet elé (review #381).
 */
export function coversByFile(rows: ReadonlyArray<{ id: string; htmlFileId: string | null; lesson: Parameters<typeof shownPictureId>[0] }>): Map<string, string | null> {
  const covers = new Map<string, string | null>();
  for (const row of rows) {
    if (!row.htmlFileId || covers.has(row.htmlFileId)) continue;
    covers.set(row.htmlFileId, shownPictureId(row.lesson, row.id));
  }
  return covers;
}
