/**
 * Kisfilm-próba (docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md, T7): egy letöltött lecke egy fejezetére lefuttatja a
 * VALÓDI gyártósort (valódi szolgáltatók, memóriabeli tár — éles adatot nem ír), és a kisfilmet a médiával együtt egy mappába írja.
 *
 * Használat: tsx scripts/clip-trial.ts <lecke.json> <fejezetindex> <kimeneti mappa>
 *   A lecke.json a `GET /api/lessons/by-file/:id` válasza. Kulcsok környezeti változóból: OPENROUTER_API_KEY (kötelező),
 *   ELEVENLABS_API_KEY, OPENAI_API_KEY, FFMPEG_PATH (elhagyhatók).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lessonSchema } from "../shared/lesson-schema";
import { animateBlockIndexes, clipSource } from "../shared/lesson-clip";
import { clipBandFor } from "../shared/clip-style";
import { makeChapterClip, type ClipDeps } from "../server/lesson-clips";
import { mediaId } from "../server/lesson-clip-media";
import { clipKeys, clipProviders } from "../server/lesson-clips-providers";

async function main(): Promise<void> {
  const [file, indexArg, outDir] = process.argv.slice(2);
  if (!file || !indexArg || !outDir) { console.error("Használat: clip-trial.ts <lecke.json> <fejezetindex> <kimeneti mappa>"); process.exit(2); }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const lesson = lessonSchema.parse(raw.lesson ?? raw);
  const sectionIndex = Number(indexArg);
  const source = clipSource(lesson, sectionIndex);
  if (!source) { console.error("Ennek a fejezetnek nincs elég tanítószövege a kisfilmhez."); process.exit(1); }
  const keys = clipKeys();
  if (!keys) { console.error("Hiányzik az OPENROUTER_API_KEY."); process.exit(1); }
  mkdirSync(path.join(outDir, "media"), { recursive: true });

  const real = clipProviders(keys);
  const timings: Array<{ what: string; ms: number; bytes?: number }> = [];
  const timed = <A extends unknown[], R>(what: string, fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    const t = Date.now();
    const out = await fn(...args);
    timings.push({ what, ms: Date.now() - t, ...(Buffer.isBuffer(out) ? { bytes: out.length } : {}) });
    return out;
  };
  const deps: ClipDeps = {
    ...real, chat: timed("forgatókönyv", real.chat), image: timed("kép", real.image), check: timed("képkapu", real.check),
    ...(real.speech ? { speech: timed("hang", real.speech) } : {}), ...(real.video ? { video: timed("mozgókép (nyers)", real.video) } : {}),
    ...(real.hear ? { hear: timed("hangkapu", real.hear) } : {}),
    shrink: timed("átkódolás", real.shrink),
  };
  const EXT: Record<string, string> = { "image/webp": "webp", "audio/mpeg": "mp3", "video/mp4": "mp4" };
  const stored: Array<{ id: string; kind: string; bytes: number }> = [];
  const started = Date.now();
  const band = clipBandFor(lesson.classroom);
  const result = await makeChapterClip(
    { title: lesson.title, subject: lesson.subject, classroom: lesson.classroom, heading: lesson.sections[sectionIndex].heading, source, animateIndexes: animateBlockIndexes(lesson, sectionIndex) },
    band, deps,
    async (kind, mime, bytes) => { const id = mediaId(bytes); writeFileSync(path.join(outDir, "media", `${id}.${EXT[mime] ?? "bin"}`), bytes); stored.push({ id, kind, bytes: bytes.length }); return id; },
  );
  const report = { sectionIndex, heading: lesson.sections[sectionIndex].heading, band, totalMs: Date.now() - started, ok: "clip" in result, ...("clip" in result ? { stats: result.stats } : { problems: result.problems }), stored, timings };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 1));
  if ("clip" in result) writeFileSync(path.join(outDir, "clip.json"), JSON.stringify(result.clip, null, 1));
  console.log(JSON.stringify({ ok: report.ok, band, totalMs: report.totalMs, ...("clip" in result ? { stats: result.stats, title: result.clip.title, says: result.clip.scenes.map((s) => s.say), overlays: result.clip.scenes.map((s) => s.overlay?.kind ?? "-") } : { problems: result.problems }) }, null, 1));
}

void main();
