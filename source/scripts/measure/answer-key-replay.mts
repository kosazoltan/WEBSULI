// Medium-visszajátszás (spec: docs/specs/2026-11-02-ellenorzes-effort-ab.md, E3): a mérési futások archivált feladataihoz
// ÚJ teszteseteket írat MEDIUM efforttal, majd a futás VÉGLEGES rubrikáját a determinisztikus pontozóval méri az új esetekre.
// Az A-ág (eredetileg is medium írta) a kontroll: az írói véletlen alapszintje; a B-ág többlete a low effort átengedése.
// Futtatás (source/ mappából): npx tsx scripts/measure/answer-key-replay.mts <mappa a single-run-measure-*-A/B.json fájlokkal>
// Kulcs: AI_INTEGRATIONS_ANTHROPIC_API_KEY (vagy ANTHROPIC_API_KEY) env. Költség: rövid hívások, futásonként ~6 batch.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLessonConversation } from "../../server/studio/single-run/conversation";
import { ANSWER_KEY_SYSTEM } from "../../server/studio/answer-key-writer";
import { sanitizeAnswerKeyCases, answerKeyProblems, answerKeyNotes } from "../../shared/answer-key-tests";
import type { OpenTask } from "../../shared/lesson-experience";

const dir = process.argv[2];
if (!dir) throw new Error("Használat: answer-key-replay.mts <mappa>");
process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||= process.env.ANTHROPIC_API_KEY ?? "";

type Entry = { id: string; q: string; sample: string; required: string[][]; bonus?: string[][]; minWords?: number; needsSentence?: boolean;
  requiredPhrases?: string[][]; requiredOrder?: string[][]; requiredDistinct?: string[][]; correct: string[]; wrong: Array<{ kind: string; text: string }> };

const files = readdirSync(dir).filter((f) => /^single-run-measure-.*-[AB]\.json$/.test(f)).sort();
const out: Record<string, unknown> = {};
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const label = f.replace(/^single-run-measure-|\.json$/g, "");
  const archive: Entry[] = Array.isArray(j.answerKeyArchive) ? (j.answerKeyArchive as Entry[]) : [];
  if (!archive.length) { out[label] = { skipped: "nincs archívum" }; console.log(label, "kihagyva: nincs archívum"); continue; }
  // PR #373 (Codex P2): rubrikaarányhoz feladatonként LEGFELJEBB EGY találat számít; a próbaszintű arányhoz külön
  // számláló és nevező (a vizsgált, blokkoló hibás próbák száma — a nem blokkoló, megkülönböztethetetlen próbák nélkül).
  let flaggedTasks = 0, missedProbes = 0, blockingProbes = 0, strictSignals = 0, judged = 0, writerMiss = 0;
  const details: string[] = [];
  for (let i = 0; i < archive.length; i += 8) {
    const batch = archive.slice(i, i + 8);
    // Az éles íróval azonos kérés-forma (answerKeyUserMessage), fogalomlista nélkül — mindkét ág visszajátszása ugyanígy megy,
    // így az összevetés (A kontroll vs B) torzítatlan.
    const user = `Feladatok:\n${JSON.stringify(batch.map((t) => ({ id: t.id, kerdes: t.q, mintavalasz: t.sample,
      ...(t.requiredPhrases?.length ? { kifejezesek: t.requiredPhrases } : {}), ...(t.requiredOrder?.length ? { sorrend: t.requiredOrder } : {}) })))}`;
    let raw: unknown;
    try {
      const reply = await createLessonConversation(ANSWER_KEY_SYSTEM, { effort: "medium" }).send([{ type: "text", text: user }]);
      raw = JSON.parse(reply.text.replace(/^```(json)?\s*|\s*```\s*$/g, "").trim());
    } catch (e) { details.push(`batch ${i / 8}: íróhiba ${String(e instanceof Error ? e.message : e).slice(0, 120)}`); continue; }
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
  out[label] = { feladatok: archive.length, judged, writerMiss, atengedettFeladat: flaggedTasks,
    atengedettProba: missedProbes, vizsgaltBlokkoloProba: blockingProbes, tulSzigoruJelzes: strictSignals, details: details.slice(0, 20) };
  console.log(label, JSON.stringify(out[label]).slice(0, 300));
}
writeFileSync(join(dir, "replay-medium-eredmeny.json"), JSON.stringify(out, null, 2));
console.log(`KÉSZ: ${join(dir, "replay-medium-eredmeny.json")}`);
