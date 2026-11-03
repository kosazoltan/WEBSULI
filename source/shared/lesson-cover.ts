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

/**
 * Spec 2026-11-03-leckeborito-utomunka: a lecke nélküli (régi HTML / PDF) anyagok kézzel választott borítója (`html_files.id` →
 * katalógusborító). Csak akkor számít, ha az anyagnak nincs publikált leckéje (annak borítója elsőbbséget élvez).
 */
export const MATERIAL_COVERS: Readonly<Record<string, string>> = {
  "baf280be-54ea-4707-84e4-048b9f089faa": "cover-l-f898345f4953d861", // English Grammar with Pictures – 4th Grade
  "2ae90d2b-ab77-401b-bd9e-65e2ed94b8a9": "cover-l-6caaeaef196888ad", // Suno AI – Zenekészítés mesterséges intelligenciával
  "8eca0ab6-571b-4562-a84d-3fc05dceb1e2": "cover-l-73f08404442cb68e", // Szabó Magda: Abigél – A regény (PDF)
  "d1cbfb26-577a-4681-a828-86831a5f9886": "cover-l-73f08404442cb68e", // Abigél (HTML)
};

/** Az anyag kézi borítója, ha az a katalógusban van; különben null (a régi viselkedés). */
export function materialCoverId(fileId: string, catalog: ReadonlyArray<{ id: string; kind: string }> = DESIGN_ASSET_CATALOG): string | null {
  const id = Object.hasOwn(MATERIAL_COVERS, fileId) ? MATERIAL_COVERS[fileId] : undefined;
  return id && catalog.some(a => a.id === id && a.kind === "cover") ? id : null;
}
