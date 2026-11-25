import sharp from "sharp";
import type { Lesson } from "../../shared/lesson-schema";
import { lessonSchema } from "../../shared/lesson-schema";
import type { SourceVisual } from "../../shared/source-visuals";
import { SOURCE_IMAGE_ID } from "../../shared/source-image";
import type { SourceImageMeta } from "../source-images";

/**
 * D1H-2 (docs/specs/2026-11-25-d1h-kivagott-kep.md, tulajdonosi döntés 2026-11-24: D1 HIBRID): a forrás fényképét (`photo`) és a rajzzal
 * vissza nem adott ábráját (`diagram`, amelyre nincs hivatkozó blokk) a leltár kivágási kerete (`crop`) szerint a KÉP forrásfájlból
 * kivágjuk, tároljuk, és `sourceImage` blokkként a fogalmait tanító fejezetbe illesztjük — forrásmegjelöléssel. PDF-oldal: D1H-3.
 * Kapcsoló: `STUDIO_SOURCE_IMAGES=on` (alapból KI → a gyártás változatlan).
 */
export const sourceImagesEnabled = (env: NodeJS.ProcessEnv = process.env) => env.STUDIO_SOURCE_IMAGES === "on";
export const SOURCE_IMAGES_PER_LESSON = 6;
const MAX_EDGE = 1600;
const MIN_EDGE = 24;

export type SourceImageStore = (bytes: Buffer, meta: SourceImageMeta) => Promise<string>;
type CropFile = { name: string; kind: string; content: string };
type PlaceResult = { lesson: Lesson; placed: string[]; skipped: Array<{ id: string; reason: string }> };

/** A W1b forrásfejléce („Forrás: URL\nCím: …”) a fájlhoz tartozó szövegből; feltöltött fájlnál a fájlnév. */
function creditFor(fileName: string, files: CropFile[], page: number, pdf: boolean): Pick<SourceImageMeta, "credit" | "sourceUrl" | "page"> {
  const header = files
    .filter((f) => f.kind === "text" && f.name !== fileName && fileName.startsWith(f.name.replace(/-forras\.txt$/, "")))
    .map((f) => /^Forrás: (https:\/\/\S+)\r?\nCím: ([^\r\n]*)/.exec(f.content))
    .find((m): m is RegExpExecArray => !!m);
  if (header) return { sourceUrl: header[1].slice(0, 2000), credit: (header[2].trim() || new URL(header[1]).hostname).slice(0, 200) };
  return { credit: `Feltöltött forrás: ${fileName}`.slice(0, 200), ...(pdf ? { page } : {}) };
}

async function cropToWebp(dataUrl: string, crop: NonNullable<SourceVisual["crop"]>): Promise<Buffer> {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:image/") || comma < 0) throw new Error("nem kép adat-URL");
  const input = Buffer.from(dataUrl.slice(comma + 1), "base64");
  // EXIF-forgatás először, hogy a keret a LÁTOTT képre vonatkozzon.
  const upright = await sharp(input, { failOn: "error", limitInputPixels: 60_000_000 }).rotate().toBuffer();
  const { width = 0, height = 0 } = await sharp(upright).metadata();
  const left = Math.max(0, Math.min(width - 1, Math.floor(crop.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(crop.y * height)));
  const w = Math.min(width - left, Math.round(crop.w * width));
  const h = Math.min(height - top, Math.round(crop.h * height));
  if (w < MIN_EDGE || h < MIN_EDGE) throw new Error("a kivágás túl kicsi");
  return sharp(upright).extract({ left, top, width: w, height: h })
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}

const conceptsOf = (b: Lesson["sections"][number]["blocks"][number]): string[] => ("coversConceptIds" in b && Array.isArray(b.coversConceptIds) ? b.coversConceptIds : []);

/** A tétel fogalmait leginkább tanító fejezet (a blokkok `coversConceptIds` egyezése); ha nincs, az első fejezet. */
function targetSection(lesson: Lesson, conceptIds: string[]): { index: number; concepts: string[] } {
  let best = { index: 0, score: 0 };
  lesson.sections.forEach((s, index) => {
    const covered = new Set(s.blocks.flatMap(conceptsOf));
    const score = conceptIds.filter((c) => covered.has(c)).length;
    if (score > best.score) best = { index, score };
  });
  const covered = new Set(lesson.sections[best.index].blocks.flatMap(conceptsOf));
  const own = conceptIds.filter((c) => covered.has(c));
  const fallback = lesson.sections[best.index].blocks.map(conceptsOf).find((c) => c.length)?.slice(0, 1) ?? [];
  return { index: best.index, concepts: own.length ? own.slice(0, 6) : fallback };
}

export async function placeSourceImages(lesson: Lesson, visuals: ReadonlyArray<SourceVisual>, files: ReadonlyArray<CropFile>, deps: { store: SourceImageStore; log?: (line: string) => void }): Promise<PlaceResult> {
  const placed: string[] = [];
  const skipped: PlaceResult["skipped"] = [];
  const referenced = new Set(lesson.sections.flatMap((s) => s.blocks.map((b) => (b as { sourceVisualId?: string }).sourceVisualId).filter(Boolean)));
  let current = lesson;
  for (const v of visuals) {
    if (v.kind !== "photo" && v.kind !== "diagram") continue;
    // A már megrajzolt (hivatkozott) ábra marad rajz; a fénykép mindig kép.
    if (v.kind === "diagram" && (referenced.has(v.id) || !v.crop)) continue;
    const skip = (reason: string) => { skipped.push({ id: v.id, reason }); deps.log?.(`[D1H] ${v.id} kimarad: ${reason}`); };
    if (!v.crop) { skip("nincs kivágási keret"); continue; }
    if (placed.length >= SOURCE_IMAGES_PER_LESSON) { skip(`leckénként legfeljebb ${SOURCE_IMAGES_PER_LESSON} kivágott kép`); continue; }
    const file = files.find((f) => f.name === v.sourceFile);
    if (!file) { skip("a forrásfájl nem érhető el"); continue; }
    if (file.kind !== "image") { skip(file.kind === "pdf" ? "PDF-oldal kivágása: D1H-3" : `nem kép forrás (${file.kind})`); continue; }
    try {
      const bytes = await cropToWebp(file.content, v.crop);
      const meta = creditFor(file.name, [...files], v.page, false);
      const imageId = await deps.store(bytes, { ...meta, sourceFile: file.name.slice(0, 255) });
      if (!SOURCE_IMAGE_ID.test(imageId)) throw new Error("érvénytelen képazonosító a tárból");
      const { index, concepts } = targetSection(current, v.conceptIds);
      if (!concepts.length) { skip("nincs fogalom, amelyhez köthető"); continue; }
      const alt = (v.kind === "photo" ? v.data.depicts : v.data.description).slice(0, 200);
      const block = { kind: "animate" as const, animKind: "sourceImage" as const, caption: (v.title ?? v.role).slice(0, 500), coversConceptIds: concepts, sourceVisualId: v.id,
        params: { imageId, alt, credit: meta.credit, ...(meta.sourceUrl ? { sourceUrl: meta.sourceUrl } : {}) } };
      const section = current.sections[index];
      const after = section.blocks.findIndex((b) => b.kind === "explain" && conceptsOf(b).some((c) => concepts.includes(c)));
      let at = after >= 0 ? after + 1 : section.blocks.length;
      // A korábban ide illesztett képek után (a leltár sorrendje marad).
      while (at < section.blocks.length && section.blocks[at].kind === "animate" && (section.blocks[at] as { animKind?: string }).animKind === "sourceImage") at++;
      const next = structuredClone(current);
      next.sections[index].blocks.splice(at, 0, block as never);
      const checked = lessonSchema.safeParse(next);
      if (!checked.success) { skip(`a lecke sémája nem fogadja: ${checked.error.issues[0]?.message ?? ""}`.slice(0, 200)); continue; }
      current = checked.data;
      placed.push(v.id);
    } catch (error) {
      skip(`a kivágás / tárolás hibázott: ${error instanceof Error ? error.message.slice(0, 160) : "ismeretlen"} (tár)`);
    }
  }
  return { lesson: current, placed, skipped };
}

/**
 * D1H-2 mentési határ: a tárban NEM létező azonosítójú `sourceImage` blokk eldobva — a modell által kitalált azonosító nem juthat a
 * leckébe. Kép nélküli leckénél nincs lekérdezés (az eredeti objektum jön vissza).
 */
export async function dropUnknownSourceImages<T>(lesson: T, existing: (ids: string[]) => Promise<Set<string>>): Promise<T> {
  const sections = (lesson as { sections?: Array<{ blocks?: unknown[] }> } | null)?.sections;
  if (!Array.isArray(sections)) return lesson;
  const idOf = (b: unknown) => {
    const x = b as { kind?: unknown; animKind?: unknown; params?: { imageId?: unknown } } | null;
    return x?.kind === "animate" && x.animKind === "sourceImage" ? String(x.params?.imageId ?? "") : null;
  };
  const ids = [...new Set(sections.flatMap((s) => (s.blocks ?? []).map(idOf).filter((i): i is string => i !== null)))];
  if (!ids.length) return lesson;
  const known = await existing(ids.filter((i) => SOURCE_IMAGE_ID.test(i)));
  if (ids.every((i) => known.has(i))) return lesson;
  return { ...lesson, sections: sections.map((s) => ({ ...s, blocks: (s.blocks ?? []).filter((b) => { const id = idOf(b); return id === null || known.has(id); }) })) } as T;
}
