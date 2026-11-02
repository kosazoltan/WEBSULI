// Medium-visszajátszás (spec: docs/specs/2026-11-02-ellenorzes-effort-ab.md, E3): a mérési futások archivált feladataihoz
// ÚJ teszteseteket írat MEDIUM efforttal — a GYÁRTÓI hívásformával (freshSystemPrompt("check") + a válaszkulcs-label és
// -szabályok, évfolyam + fogalmak az éles térképből, CSAK OLVASVA) —, majd a futás archívumban lévő (a véglegesítés óta a
// KALIBRÁLT, közzétett) rubrikáját a determinisztikus pontozóval méri az új esetekre.
// Az A-ág (eredetileg is medium írta) a kontroll: az írói véletlen alapszintje; a B-ág többlete a low effort átengedése.
// Futtatás (source/ mappából): npx tsx scripts/measure/answer-key-replay.mts <mappa a single-run-measure-*-A/B.json fájlokkal>
// Kulcs: AI_INTEGRATIONS_ANTHROPIC_API_KEY (vagy ANTHROPIC_API_KEY) env / source/.env. Költség: rövid hívások, futásonként ~6 batch.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withReadOnlyDb } from "../lib/read-only-db"; // importja a source/.env-et is betölti
import { createLessonConversation } from "../../server/studio/single-run/conversation";
import { freshSystemPrompt } from "../../server/studio/single-run/engine";
import { ANSWER_KEY_SYSTEM } from "../../server/studio/answer-key-writer";
import { sanitizeAnswerKeyCases, answerKeyProblems, answerKeyNotes } from "../../shared/answer-key-tests";
import type { OpenTask } from "../../shared/lesson-experience";

const dir = process.argv[2];
if (!dir) throw new Error("Használat: answer-key-replay.mts <mappa>");
process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||= process.env.ANTHROPIC_API_KEY ?? "";
// PR #373 review (Sourcery): kulcs nélkül NINCS jelentés — a hiányos mérés nem nézhet ki késznek.
// Ugyanazok a kulcsforrások, mint a createLessonConversation-ben (Vercel review): Anthropic vagy OpenAI (mindkét névvel).
if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim() && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("Nincs modellkulcs (AI_INTEGRATIONS_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY) — a visszajátszás el sem indul.");
}
const PROD_LABEL = "VÁLASZKULCS-TESZTEK (a pontozó próbája)."; // engine.ts:678 — a gyártói hívás labelje

type Entry = { id: string; q: string; sample: string; required: string[][]; bonus?: string[][]; minWords?: number; needsSentence?: boolean;
  requiredPhrases?: string[][]; requiredOrder?: string[][]; requiredDistinct?: string[][]; correct: string[]; wrong: Array<{ kind: string; text: string }> };
type MapCtx = { classroom: number | null; concepts: Array<{ id: string; term: string; definition: string }> };

// Évfolyam + fogalmak az ÉLES térképből (csak olvasás) — az archívum nem tárolja a fogalomkiosztást, ezért a térkép
// TELJES fogalomlistája megy (bővebb kontextus, mindkét ág visszajátszása azonosan kapja).
const ctxCache = new Map<string, MapCtx>();
async function mapContext(map8: string): Promise<MapCtx> {
  const hit = ctxCache.get(map8);
  if (hit) return hit;
  const ctx = await withReadOnlyDb(async (q) => {
    const [map] = await q<{ id: string; classroom: number }>("SELECT id, classroom FROM knowledge_maps WHERE id::text LIKE $1 LIMIT 1", [`${map8}%`]);
    if (!map) return { classroom: null, concepts: [] };
    const concepts = await q<{ id: string; term: string; definition: string }>(
      "SELECT local_id AS id, term, left(definition, 400) AS definition FROM km_concepts WHERE map_id = $1 ORDER BY order_index", [map.id]);
    return { classroom: map.classroom, concepts };
  }).catch(() => ({ classroom: null, concepts: [] as MapCtx["concepts"] }));
  ctxCache.set(map8, ctx);
  return ctx;
}

const files = readdirSync(dir).filter((f) => /^single-run-measure-.*-[AB]\.json$/.test(f)).sort();
const out: Record<string, unknown> = {};
let anyFailed = false;
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const label = f.replace(/^single-run-measure-|\.json$/g, "");
  const map8 = label.replace(/-[AB]$/, "");
  const archive: Entry[] = Array.isArray(j.answerKeyArchive) ? (j.answerKeyArchive as Entry[]) : [];
  if (!archive.length) { out[label] = { skipped: "nincs archívum" }; console.log(label, "kihagyva: nincs archívum"); continue; }
  const ctx = await mapContext(map8);
  // PR #373 review (Codex P2 + Sourcery): rubrikaarányhoz feladatonként LEGFELJEBB EGY találat; a próbaszintű arányhoz
  // külön számláló és nevező (a vizsgált, blokkoló hibás próbák — a nem blokkoló, megkülönböztethetetlenek nélkül).
  let flaggedTasks = 0, missedProbes = 0, blockingProbes = 0, strictSignals = 0, judged = 0, writerMiss = 0, failedBatches = 0;
  const details: string[] = [];
  for (let i = 0; i < archive.length; i += 8) {
    const batch = archive.slice(i, i + 8);
    // A gyártói kérés-forma (answerKeyUserMessage + freshJsonCall): évfolyam, fogalmak, feladatok; label + szabályok + kérés.
    const user = `${ctx.classroom != null ? `Évfolyam: ${ctx.classroom}. osztály.\n` : ""}Fogalmak:\n${JSON.stringify(ctx.concepts)}\n\nFeladatok:\n${JSON.stringify(batch.map((t) => ({ id: t.id, kerdes: t.q, mintavalasz: t.sample,
      ...(t.requiredPhrases?.length ? { kifejezesek: t.requiredPhrases } : {}), ...(t.requiredOrder?.length ? { sorrend: t.requiredOrder } : {}) })))}`;
    let raw: unknown;
    try {
      const reply = await createLessonConversation(freshSystemPrompt("check"), { effort: "medium" })
        .send([{ type: "text", text: `${PROD_LABEL}\n${ANSWER_KEY_SYSTEM}\n\n${user}` }]);
      raw = JSON.parse(reply.text.replace(/^```(json)?\s*|\s*```\s*$/g, "").trim());
    } catch (e) { failedBatches++; details.push(`batch ${i / 8}: íróhiba ${String(e instanceof Error ? e.message : e).slice(0, 120)}`); continue; }
    const items = Array.isArray((raw as { items?: unknown[] } | null)?.items) ? (raw as { items: unknown[] }).items : [];
    const byId = new Map(items.map((it) => [String((it as { id?: unknown })?.id ?? ""), it] as const));
    for (const t of batch) {
      const cases = sanitizeAnswerKeyCases(byId.get(t.id));
      if (!cases) { writerMiss++; continue; }
      judged++;
      const task = { id: t.id, q: t.q, sample: t.sample, required: t.required, bonus: t.bonus ?? [], minWords: t.minWords,
        needsSentence: t.needsSentence, requiredPhrases: t.requiredPhrases, requiredOrder: t.requiredOrder,
        requiredDistinct: t.requiredDistinct, coversConceptIds: [] } as unknown as OpenTask;
      const problems = answerKeyProblems(task, cases);
      const missed = problems.filter((p) => p.includes("a hibás")).length; // túl megengedő (átengedett) rubrika
      const strict = problems.filter((p) => p.includes("a helyes")).length; // túl szigorú rubrika jelzése
      blockingProbes += Math.max(0, cases.wrong.length - answerKeyNotes(task, cases).length);
      missedProbes += missed; strictSignals += strict;
      if (missed) { flaggedTasks++; details.push(`${t.id}: ${missed} átengedett hibás próba a medium-írótól`); }
    }
  }
  if (failedBatches) anyFailed = true;
  out[label] = { feladatok: archive.length, judged, writerMiss, failedBatches, ...(failedBatches ? { ervenytelen: true } : {}),
    atengedettFeladat: flaggedTasks, atengedettProba: missedProbes, vizsgaltBlokkoloProba: blockingProbes,
    tulSzigoruJelzes: strictSignals, evfolyam: ctx.classroom, fogalomKontextus: ctx.concepts.length, details: details.slice(0, 20) };
  console.log(label, JSON.stringify(out[label]).slice(0, 300));
}
// PR #373 review (Sourcery): párhuzamos futások ne írják felül egymást; a hiányos mérés jelölten hiányos.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = join(dir, `replay-medium-eredmeny-${stamp}.json`);
writeFileSync(file, JSON.stringify({ ...(anyFailed ? { ervenytelen: true } : {}), runs: out }, null, 2));
if (anyFailed) { console.error(`HIÁNYOS (volt sikertelen batch): ${file}`); process.exit(1); }
console.log(`KÉSZ: ${file}`);
