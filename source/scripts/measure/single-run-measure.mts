// J3 (docs/specs/2026-10-16-egyfutas-atvilagitas.md): egy egyfutásos gyártás mérése ELEJÉTŐL a közzétételig, EGY eldobható helyi
// Postgresen (Docker), valódi modellel (Opus 5.5, tartalék GPT-6.1 Sol). Az éles adatbázisból csak OLVAS (a forrásszöveget), oda nem ír.
// A kimenet a job telemetriája (`output.telemetry`) és a közzétett lecke mérőszámai (`measureLesson`).
// Futtatás (source/ mappából): npx tsx scripts/measure/single-run-measure.mts <térkép-azonosító eleje | file:útvonal> <címke> [kimeneti mappa]
// Költség: egy teljes gyártás (mérve 2026-10-16: 3,5–4,9 M bemeneti token, 25–27 perc).
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { withReadOnlyDb } from "../lib/read-only-db";

const [target, label, outDir = "."] = process.argv.slice(2);
if (!target || !label) throw new Error("Használat: single-run-measure.mts <térkép-azonosító eleje | file:útvonal> <címke> [kimeneti mappa]");
const out: Record<string, unknown> = { label, target, startedAt: new Date().toISOString() };

// 1) A forrás: éles térkép forrásszövege (csak olvasás), vagy helyi fájl (kép / PDF / szöveg).
type File = { name: string; kind: "text" | "image" | "pdf"; content: string };
let files: File[];
let sourceText = "";
if (target.startsWith("file:")) {
  const path = target.slice(5);
  const lower = path.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md")) { sourceText = readFileSync(path, "utf8"); files = [{ name: path.split(/[\\/]/).pop()!, kind: "text", content: sourceText }]; }
  else {
    const kind = lower.endsWith(".pdf") ? "pdf" : "image";
    const mime = kind === "pdf" ? "application/pdf" : lower.endsWith(".png") ? "image/png" : "image/jpeg";
    files = [{ name: path.split(/[\\/]/).pop()!, kind, content: `data:${mime};base64,${readFileSync(path).toString("base64")}` }];
  }
} else {
  const [row] = await withReadOnlyDb((q) => q<{ id: string; title: string; source_text: string }>("SELECT id, title, source_text FROM knowledge_maps WHERE id::text LIKE $1 LIMIT 1", [`${target}%`]));
  if (!row?.source_text) throw new Error("Nincs ilyen (forrásszöveges) térkép.");
  sourceText = row.source_text;
  out.sourceMap = { id: row.id, title: row.title, chars: sourceText.length };
  files = [{ name: "forras.txt", kind: "text", content: sourceText }];
}

// 2) Eldobható Postgres; a séma a drizzle-kit exportból. Az éles kapcsolat innentől nem használható (biztonsági őr lent).
const name = `websuli-measure-${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const env = { ...process.env, POSTGRES_PASSWORD: password };
const cmd = (file: string, args: string[]) => execFileSync(file, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).trim();
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const id = cmd(docker, ["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB=websuli_measure", "-p", "127.0.0.1::5432", "postgres:17"]);
try {
  const url = `postgresql://postgres:${password}@${cmd(docker, ["port", id, "5432/tcp"])}/websuli_measure`;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  for (let i = 0; i < 60; i++) { try { await pool.query("select 1"); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  await pool.query(cmd(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "export", "--dialect=postgresql", "--schema=./shared/schema.ts"]));
  await pool.query("INSERT INTO users(id,email,is_admin) VALUES ('measure-owner','measure@test.invalid',true)");
  process.env.DATABASE_URL = url;
  delete process.env.DEV_DATABASE_URL;
  process.env.NODE_ENV = "test"; // a server/db.ts fejlesztői ága ne vihesse máshová
  if (!/@127\.0\.0\.1:\d+\/websuli_measure$/.test(process.env.DATABASE_URL)) throw new Error("Biztonsági őr: a mérés csak az eldobható helyi adatbázisra írhat.");
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||= process.env.ANTHROPIC_API_KEY ?? "";

  // 3) A motor az éles bekötéssel azonos függőségekkel (fő + friss beszélgetések, adattár); a telemetria a jobra kerül.
  const { createLessonConversation } = await import("../../server/studio/single-run/conversation");
  const { runSingleLesson, singleRunSystemPrompt } = await import("../../server/studio/single-run/engine");
  const { saveSingleRunMap } = await import("../../server/studio/single-run/live");
  const { createDrizzlePipelineStore } = await import("../../server/studio/pipeline-store");
  const { measureLesson } = await import("../../server/studio/lesson-metrics");
  const logs: string[] = [];
  const conversation = createLessonConversation(singleRunSystemPrompt(), { onFallback: (reason) => logs.push(`FALLBACK: ${reason}`) });
  let error: string | null = null;
  let result: Awaited<ReturnType<typeof runSingleLesson>> | undefined;
  try {
    result = await runSingleLesson({ files, ownerId: "measure-owner" }, {
      conversation,
      fresh: (system) => createLessonConversation(system, { onFallback: (reason) => logs.push(`FALLBACK (friss): ${reason}`) }),
      store: await createDrizzlePipelineStore(),
      saveMap: (map, f) => saveSingleRunMap(map, f, "measure-owner", conversation.model),
      log: (m) => logs.push(m),
    });
  } catch (e) { error = e instanceof Error ? e.message : String(e); }

  // 4) A job (telemetria, jelzések) és a közzétett lecke mérőszámai.
  const job = (await pool.query("SELECT step, status, error, output FROM studio_jobs ORDER BY created_at DESC LIMIT 1")).rows[0];
  out.error = error;
  out.job = job ? { step: job.step, status: job.status, error: job.error?.slice(0, 500) ?? null, qualityNotes: job.output?.qualityNotes ?? [], warnings: job.output?.quality?.warnings ?? [] } : null;
  out.telemetry = job?.output?.telemetry ?? null;
  out.fallback = logs.filter((l) => l.startsWith("FALLBACK"));
  out.gateLogs = logs.filter((l) => /Válaszkulcs|Kvíz-előszűrő|quiz-blind|answer-key|Terjedelmi|Forrás-helyesbítés|bankcsomag|kivéve|lektor/i.test(l)).map((l) => l.slice(0, 300));
  if (result) {
    const lesson = (await pool.query("SELECT json FROM lessons WHERE id=$1", [result.lessonId])).rows[0].json;
    const concepts = (await pool.query("SELECT term, definition, quote, exam_weight AS \"examWeight\" FROM km_concepts WHERE map_id=$1", [result.mapId])).rows;
    const map = (await pool.query("SELECT source_text FROM knowledge_maps WHERE id=$1", [result.mapId])).rows[0];
    out.lesson = { title: lesson.title, sections: lesson.sections.length, tasks: lesson.experience?.tasks?.length, quiz: lesson.experience?.quiz?.length, methods: lesson.experience?.methods?.length, concepts: concepts.length };
    out.metrics = measureLesson(lesson, { sourceText: sourceText || map.source_text, concepts });
  }
  await pool.end();
} finally {
  try { cmd(docker, ["rm", "-f", id]); } catch { /* már leállt */ }
}
const file = join(outDir, `single-run-measure-${label}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`KÉSZ ${label}: ${file}`);
