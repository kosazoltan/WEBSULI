/** Read-only production source, shared repair path, local artifacts; no publishing import is executed. */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { lessonSchema } from "../shared/lesson-schema";
import { experienceProblems } from "../shared/lesson-experience-validation";
import type { ExperienceCheckpoint } from "../server/studio/experience-builder";
import { buildStructuredImprovement, finishStructuredImprovement } from "../server/studio/structured-improvement";
import { OpenRouterProvider } from "../server/ai/OpenRouterProvider";
import { resolveStudioModel } from "../server/ai/models";
import { callStepModel } from "../server/studio/run-step";
import { classifyNotes } from "../server/studio/lektor";
import { buildLektorPrompt, lektorReportSchema } from "../server/studio/step-io";

const out = new URL("../../tmp/lesson-fusion/", import.meta.url);
await mkdir(out, { recursive: true });
async function main() {
const reviewOnly = process.argv.includes("--review-existing");
const evidenceFile = new URL(reviewOnly ? "review-follow-up-evidence.json" : "evidence.json", out);
await writeFile(evidenceFile, JSON.stringify({ status: "running", startedAt: new Date().toISOString(), databaseWrites: 0 }, null, 2));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
let lesson, source;
try {
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query("SELECT json, map_id FROM lessons WHERE json->>'title' ILIKE $1 ORDER BY created_at ASC LIMIT 1", ["%háromszög%"]);
  if (!rows.length) throw new Error("Nincs háromszögekről szóló lecke.");
  lesson = lessonSchema.parse(rows[0].json);
  source = (await client.query('SELECT local_id AS "localId", term, definition, quote, exam_weight AS "examWeight" FROM km_concepts WHERE map_id=$1 AND review_state<>$2 ORDER BY local_id', [rows[0].map_id, "rejected"])).rows;
  await client.query("COMMIT");
} finally { client.release(); await pool.end(); }
await writeFile(new URL("original.json", out), JSON.stringify(lesson, null, 2));
process.stdout.write(`Forrás: ${lesson.title}, ${lesson.classroom}. osztály, ${source.length} fogalom. Adatbázis csak olvasva.\n`);
let checkpoint: ExperienceCheckpoint | undefined;
try { checkpoint = JSON.parse(await readFile(new URL("checkpoint.json", out), "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
let calls = 0, tokensIn = 0, tokensOut = 0;
const started = Date.now();
const call = async (step: "author" | "lektor", system: string, user: string) => {
  const model = resolveStudioModel(step);
  process.stdout.write(`${++calls}. modellhívás: ${step}, bemenet ${system.length + user.length} karakter\n`);
  const provider = new OpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY ?? "", model, timeout: 180000, maxTokens: 24000 });
  const result = await callStepModel(provider, { step, model, system, user });
  await writeFile(new URL(`${reviewOnly ? "review-follow-up" : "full-repair"}-call-${calls}.json`, out), JSON.stringify(result.json, null, 2));
  tokensIn += result.usage?.promptTokens ?? 0; tokensOut += result.usage?.completionTokens ?? 0;
  return result.json;
};
const progress = { checkpoint, save: async (cp: ExperienceCheckpoint) => { await writeFile(new URL("checkpoint.json", out), JSON.stringify(cp)); process.stdout.write(`Érvényes bankrészek: ${Object.keys(cp.parts).length}/7\n`); } };
const sourceMap = { subject: lesson.subject, classroom: lesson.classroom, concepts: source };
if (reviewOnly) {
  const existing = lessonSchema.parse(JSON.parse(await readFile(new URL("candidate.json", out), "utf8")));
  const review = lektorReportSchema.parse(await call("lektor", buildLektorPrompt(existing, sourceMap), "Ellenőrizd a teljes tanítást és a bankokat, a forráseredetű hibákat adminjegyzetként különítsd el. Csak JSON."));
  const classified = classifyNotes(review.notes);
  const evidence = { status: classified.some(n => n.blocking) ? "blocked" : "reviewed", notes: classified, currentRunOnly: { calls, tokensIn, tokensOut, seconds: Math.round((Date.now() - started) / 1000) }, databaseWrites: 0 };
  await writeFile(evidenceFile, JSON.stringify(evidence, null, 2));
  process.stdout.write(JSON.stringify(evidence) + "\n");
  return;
}
const resumed = process.argv.includes("--verified-teaching");
const { candidate, review } = resumed
  ? await finishStructuredImprovement(lesson, lessonSchema.parse(JSON.parse(await readFile(new URL("verified-teaching.json", out), "utf8"))), sourceMap, call, progress)
  : await buildStructuredImprovement(lesson, sourceMap, call,
  "A korábbi próbán a lektor forráseltérést talált: az általános területképlet a kurált forrás kiegészítő téglalapjával legyen levezetve. Az a=12 cm, m_a=25 cm, T=150 cm², m_b=15 cm, b=20 cm teljes példaláncot tanítsd meg explain/example blokkban. A többi jól tanított forrástartalom is maradjon.",
  progress);
await writeFile(new URL("candidate.json", out), JSON.stringify(candidate, null, 2));
await writeFile(new URL("review.json", out), JSON.stringify(review, null, 2));
const blockingNotes = classifyNotes(review.notes).filter(n => n.blocking).length;
const evidence = { status: "locally-validated", checkedAt: new Date().toISOString(), inspectedTeachingCheckpoint: resumed, title: candidate.title, classroom: candidate.classroom, concepts: source.length, methods: candidate.experience!.methods.length, tasks: candidate.experience!.tasks.length, quiz: candidate.experience!.quiz.length, oral: candidate.experience!.tasks.filter(t => t.mode === "oral").length, problems: experienceProblems(candidate), reviewNotes: review.notes.length, blockingNotes, currentRunOnly: { calls, tokensIn, tokensOut, seconds: Math.round((Date.now() - started) / 1000) }, databaseWrites: 0 };
await writeFile(new URL("evidence.json", out), JSON.stringify(evidence, null, 2));
process.stdout.write(JSON.stringify(evidence) + "\n");
}
await main().catch(async error => {
  const message = error instanceof Error ? error.message : "A helyi próba sikertelen.";
  await writeFile(new URL(process.argv.includes("--review-existing") ? "review-follow-up-evidence.json" : "evidence.json", out), JSON.stringify({ status: "failed", checkedAt: new Date().toISOString(), message, databaseWrites: 0 }, null, 2));
  process.stderr.write(message + "\n"); process.exitCode = 1;
});
