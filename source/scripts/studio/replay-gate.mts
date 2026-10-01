/* eslint-disable no-console -- parancssori eszköz, a kimenet a felhasználónak szól */
/**
 * Spec 2026-10-01-gyokerok-egyben (2.4): a kapu körlimit-ágának determinisztikus visszajátszása rögzített futáson —
 * modellköltség és hálózat nélkül. Használat:
 *   node --import tsx scripts/studio/replay-gate.mts tests/fixtures/replay/*.json
 *   node --env-file=.env --import tsx scripts/studio/replay-gate.mts --job <studio_jobs.id> [--save tests/fixtures/replay/<név>.json]
 * A `--job` az éles DB-ből olvas (csak olvasás), és opcionálisan fixture-ként menti a futást.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { replayLimitGate, type ReplayFixture } from "../../server/studio/limit-replay";

async function loadFromDb(jobId: string): Promise<ReplayFixture> {
  const { sql } = await import("drizzle-orm");
  const { db, dbPool } = await import("../../server/db");
  try {
    const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>;
    const job = rows(await db.execute(sql`select map_id, output from studio_jobs where id::text = ${jobId}`))[0];
    if (!job) throw new Error(`nincs ilyen job: ${jobId}`);
    const out = job.output as Record<string, unknown>;
    const concepts = rows(await db.execute(sql`select local_id, term, definition, quote, exam_weight, review_state from km_concepts where map_id = ${job.map_id as string}`))
      .filter((c) => c.review_state !== "rejected")
      .map((c) => ({ localId: c.local_id, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.exam_weight }) as ReplayFixture["concepts"][number]);
    return { jobId, lesson: out.lesson, choiceFlags: (out.choiceFlags as unknown[]) ?? [], bankOpenFindings: out.bankOpenFindings ?? null, topicFocus: (out.topicFocus as ReplayFixture["topicFocus"]) ?? null, instructionConcepts: (out.instructionConcepts as ReplayFixture["instructionConcepts"]) ?? [], concepts };
  } finally {
    await dbPool.end().catch(() => undefined);
  }
}

const args = process.argv.slice(2);
const jobIdx = args.indexOf("--job");
const saveIdx = args.indexOf("--save");
const fixtures: ReplayFixture[] = [];
if (jobIdx >= 0) {
  const fx = await loadFromDb(args[jobIdx + 1]);
  if (saveIdx >= 0) { writeFileSync(args[saveIdx + 1], JSON.stringify(fx)); console.log(`mentve: ${args[saveIdx + 1]}`); }
  fixtures.push(fx);
} else {
  for (const file of args.filter((a) => a.endsWith(".json"))) fixtures.push(JSON.parse(readFileSync(file, "utf8")) as ReplayFixture);
}
if (!fixtures.length) { console.error("Adj meg fixture JSON-t vagy --job <id>-t."); process.exit(2); }
let failed = 0;
for (const fx of fixtures) {
  const r = replayLimitGate(fx);
  if (!r.publishable) failed++;
  console.log(`${fx.jobId.slice(0, 8)} ${r.publishable ? "PUBLIKÁL" : `NEM PUBLIKÁL (${r.stage})`} — kivett tétel: ${r.removed.length}, kivett blokk: ${r.removedBlocks.length}, bankból kikerült: ${r.removedItems.length}, padló: ${r.limitRelaxed}${r.reason ? `\n  ok: ${r.reason.slice(0, 300)}` : ""}`);
}
process.exit(failed ? 1 : 0);
