// Determinisztikus gyártási kapuk futtatása FÁJLOKON (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, SK1) — modellhívás és
// adatbázis NÉLKÜL. Helyi ellenőrzésre és az SK5 alapvonal-mérőjének.
// Futtatás (a source/ mappából): node --import tsx scripts/gates/run-gates.mts --lesson <lecke.json> --map <térkép.json> [--skipped <kihagyások.json>]
//   <lecke.json>:  a lecke JSON-ja ({ sections: [...] }) vagy egy job kimenete ({ lesson, outline? });
//   <térkép.json>: { visuals: [...] } | { sourceFiles: [{ visuals }] } | { source_files: [...] } | { meta: { visuals } } | [...tételek];
//   <kihagyások.json>: [{ id, reason, duplicateOf? }] — hiányában a job kimenetének outline.skippedVisuals mezője.
// Kimenet: JSON a szabványos kimeneten. Kilépési kód: 0 = minden kapu átment; 1 = legalább egy kapu bukott; 2 = hibás hívás / bemenet
// (ismeretlen térképalak vagy akár egyetlen érvénytelen leltártétel is — független review F10: olvashatatlan bemenetre nincs „zöld”).
import { readFileSync } from "node:fs";
import { runRegisteredGates } from "../../server/studio/gates/types";
import "../../server/studio/gates/source-coverage-gate";
import { sourceVisualSchema, visualsOfSourceFiles, type SkippedSourceVisual, type SourceVisual } from "../../shared/source-visuals";

function fail(message: string): never {
  process.stderr.write(`${message}\nHasználat: run-gates.mts --lesson <lecke.json> --map <térkép.json> [--skipped <kihagyások.json>]\n`);
  process.exit(2);
}
const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const readJson = (path: string): unknown => { try { return JSON.parse(readFileSync(path, "utf8")); } catch (error) { return fail(`Nem olvasható JSON: ${path} — ${error instanceof Error ? error.message : String(error)}`); } };
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

const lessonPath = arg("lesson");
const mapPath = arg("map");
if (!lessonPath || !mapPath) fail("Hiányzó --lesson vagy --map.");

const lessonFile = readJson(lessonPath);
const lesson = isObject(lessonFile) && isObject(lessonFile.lesson) ? lessonFile.lesson : lessonFile;
if (!isObject(lesson) || !Array.isArray(lesson.sections)) fail("A lecke JSON-jában nincs `sections` tömb.");

const mapFile = readJson(mapPath);
const sourceFiles = isObject(mapFile) ? mapFile.sourceFiles ?? mapFile.source_files : undefined;
// A felismert térképalakok; minden más (pl. { "foo": 1 }) hibás bemenet — nem „leltár nélküli forrás”.
const rawVisuals: unknown[] | null = Array.isArray(mapFile) ? mapFile
  : isObject(mapFile) && Array.isArray(mapFile.visuals) ? mapFile.visuals
  : isObject(mapFile) && isObject(mapFile.meta) && Array.isArray(mapFile.meta.visuals) ? mapFile.meta.visuals
  : Array.isArray(sourceFiles) ? sourceFiles.flatMap((file) => (isObject(file) && Array.isArray(file.visuals) ? file.visuals : []))
  : null;
if (rawVisuals === null) fail("A térkép JSON-ja ismeretlen térképalak: { visuals } | { sourceFiles } | { source_files } | { meta: { visuals } } | [tételek] kell.");
const visuals: SourceVisual[] = Array.isArray(sourceFiles) && !rawVisuals.length ? visualsOfSourceFiles(sourceFiles)
  : rawVisuals.flatMap((v) => { const p = sourceVisualSchema.safeParse(v); return p.success ? [p.data] : []; });
const invalidVisuals = rawVisuals.length - visuals.length;
if (invalidVisuals > 0) fail(`A térkép leltárában ${invalidVisuals} érvénytelen tétel van (a ${rawVisuals.length}-ból) — a kapuk hibás leltáron nem ítélnek.`);

const skippedPath = arg("skipped");
const skippedRaw = skippedPath ? readJson(skippedPath) : isObject(lessonFile) && isObject(lessonFile.outline) ? lessonFile.outline.skippedVisuals : [];
const skipped = (Array.isArray(skippedRaw) ? skippedRaw : []).filter((s): s is SkippedSourceVisual => isObject(s) && typeof s.id === "string" && typeof s.reason === "string");

const results = runRegisteredGates({ lesson: lesson as { sections: Array<{ blocks: object[] }> }, visuals, skipped });
const ok = results.every((r) => r.ok);
process.stdout.write(`${JSON.stringify({ ok, visuals: visuals.length, invalidVisuals, skipped: skipped.length, results }, null, 2)}\n`);
process.exit(ok ? 0 : 1);
