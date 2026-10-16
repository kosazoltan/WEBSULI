// Bővülő szinonimaszótár — mérés (docs/specs/2026-10-16-szinonimaszotar-meres.md). Csak olvas, modellt nem hív.
// Futtatás (source/ mappából): npx tsx scripts/measure/synonym-bank-trial.mts <answer-key-trial.json> <kimeneti json>
import { readFileSync, writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import type { AnswerKeyCases } from "../../shared/answer-key-tests";
import { calibrateRubric } from "../../shared/answer-key-calibrate";
import { evaluateOpenAnswer, missingAnswerConcepts, normalizeAnswer, SENTENCE_CONNECTIVES, STEM_SUFFIXES } from "../../shared/lesson-experience-score";
import type { OpenTask } from "../../shared/lesson-experience";

const [trialFile, outFile] = process.argv.slice(2);
if (!trialFile || !outFile) throw new Error("Használat: synonym-bank-trial.mts <answer-key-trial.json> <kimeneti json>");
const trial = JSON.parse(readFileSync(trialFile, "utf8")) as { rows: Array<{ jobId: string; taskId: string; cases: AnswerKeyCases | null }> };
const casesOf = new Map(trial.rows.filter((r) => r.cases).map((r) => [`${r.jobId}:${r.taskId}`, r.cases!]));
const jobIds = [...new Set(trial.rows.map((r) => r.jobId))];
if (jobIds.length > 4) throw new Error("Költségkorlát: legfeljebb 4 job.");

type Item = { jobId: string; subject: string; task: OpenTask; cases: AnswerKeyCases };
const { items, arbiterCorrectVerdicts } = await withReadOnlyDb(async (q) => {
  const out: Item[] = [];
  for (const id of jobIds) {
    const [job] = await q<{ output: { lesson?: { experience?: { tasks?: OpenTask[] } } }; subject: string }>(
      "SELECT j.output, m.subject FROM studio_jobs j JOIN knowledge_maps m ON m.id = j.map_id WHERE j.id=$1", [id]);
    for (const t of job?.output?.lesson?.experience?.tasks ?? []) {
      const cases = casesOf.get(`${id}:${t.id}`);
      if (cases) out.push({ jobId: id, subject: job.subject, task: calibrateRubric(t, cases).task, cases });
    }
  }
  // Csak darabszám: a tábla adatminimalizálás miatt a válasz szövegét nem tárolja (T7), így tanulási forrásnak jelen formájában nem alkalmas.
  const [c] = await q<{ n: string }>("SELECT count(*)::text AS n FROM arbiter_verdicts WHERE state = 'ok'");
  return { items: out, arbiterCorrectVerdicts: Number(c?.n ?? 0) };
});

const words = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);
const STOP = new Set([...SENTENCE_CONNECTIVES, "nem", "is", "egy", "van", "volt", "vannak", "ez", "azt", "ezt", "ami", "amely", "pedig", "meg", "de", "mert", "hogy", "majd", "csak", "nagyon", "sok", "kell", "lesz", "ott", "itt"]);
// Ugyanaz a toldaléklevágás, mint a pontozóé (≥ 4 betűs szónál egyszer).
const stem = (w: string) => { for (const s of STEM_SUFFIXES) if (w.length > s.length + 3 && w.endsWith(s)) return w.slice(0, -s.length); return w; };

type Entry = { subject: string; jobId: string; taskId: string; groupStems: string[]; word: string };
function learn(from: Item[]): Entry[] {
  const out: Entry[] = [];
  for (const it of from) {
    const known = new Set([...words(it.task.sample), ...words(it.task.q), ...it.task.required.flat().flatMap(words), ...it.task.bonus.flat().flatMap(words)].map(stem));
    for (const answer of it.cases.correct) {
      if (evaluateOpenAnswer(answer, it.task).state === "ok") continue;
      const missing = missingAnswerConcepts(answer, it.task);
      if (missing.length !== 1) continue;
      const fresh = [...new Set(words(answer).filter((w) => w.length >= 4 && !/\d/.test(w) && !STOP.has(w) && !known.has(stem(w))))];
      if (fresh.length !== 1) continue;
      out.push({ subject: it.subject, jobId: it.jobId, taskId: it.task.id, groupStems: [...new Set(missing[0].flatMap(words).map(stem))], word: fresh[0] });
    }
  }
  return out;
}

const guardOk = (t: OpenTask, c: AnswerKeyCases) => evaluateOpenAnswer(t.sample, t).state === "ok" && c.wrong.every((w) => evaluateOpenAnswer(w.text, t).state !== "ok");

/**
 * A szótár alkalmazása egy feladatra, BEJEGYZÉSENKÉNT (review #254): minden jelölt szó külön kerül a hiányzó csoportba, és csak akkor marad,
 * ha az őr (minta ok, egyik hibás eset sem ok) vele együtt is teljesül — egy veszélyes szó nem veti el a többi, biztonságos bejegyzést.
 */
function apply(it: Item, bank: Entry[]): { task: OpenTask; applied: boolean; rejected: boolean } {
  let task = it.task;
  let applied = false, rejected = false;
  task.required.forEach((group, index) => {
    const stems = new Set(group.flatMap(words).map(stem));
    const candidates = [...new Set(bank.filter((e) => e.groupStems.some((st) => stems.has(st))).map((e) => e.word))].filter((w) => !group.includes(w));
    for (const word of candidates) {
      const next = { ...task, required: task.required.map((g, i) => (i === index ? [...g, word] : g)) };
      if (guardOk(next, it.cases)) { task = next; applied = true; } else rejected = true;
    }
  });
  return { task, applied, rejected };
}

function measure(bankFor: (it: Item) => Entry[]) {
  let failingCorrect = 0, wrongPass = 0, appliedTasks = 0, guardRejected = 0, entries = 0;
  const distinct = new Set<string>();
  for (const it of items) {
    const bank = bankFor(it);
    entries += bank.length;
    for (const e of bank) distinct.add(`${e.jobId}:${e.taskId}:${e.word}`);
    const r = apply(it, bank);
    if (r.applied) appliedTasks++;
    if (r.rejected) guardRejected++;
    failingCorrect += it.cases.correct.filter((a) => evaluateOpenAnswer(a, r.task).state !== "ok").length;
    wrongPass += it.cases.wrong.filter((w) => evaluateOpenAnswer(w.text, r.task).state === "ok").length;
  }
  // Review #254: a szerződés szerinti szótárméret (a változat összes különböző bejegyzése) az átlag mellett.
  return { failingCorrect, wrongPass, appliedTasks, guardRejected, entries: distinct.size, avgEntriesPerTask: +(entries / items.length).toFixed(1) };
}

const byJob = new Map(jobIds.map((id) => [id, learn(items.filter((i) => i.jobId !== id))]));
const allEntries = learn(items);
const result = {
  date: new Date().toISOString().slice(0, 10), source: trialFile.replace(/^.*[\\/]/, ""), tasks: items.length,
  subjects: [...new Set(items.map((i) => i.subject))],
  baseline: measure(() => []),
  variants: {
    // (a) egy jobot kihagyunk, minden bejegyzés; (b) ugyanez, csak azonos tantárgy; (c) felső becslés: ugyanannak a jobnak MÁS feladatai.
    all: measure((it) => byJob.get(it.jobId)!),
    sameSubject: measure((it) => byJob.get(it.jobId)!.filter((e) => e.subject === it.subject)),
    sameJobOtherTasks: measure((it) => allEntries.filter((e) => e.jobId === it.jobId && e.taskId !== it.task.id)),
  },
  learnedEntries: allEntries.length,
  foldEntries: Object.fromEntries([...byJob].map(([id, b]) => [id.slice(0, 8), b.length])),
  examples: allEntries.slice(0, 15).map((e) => ({ subject: e.subject, group: e.groupStems.slice(0, 4), word: e.word })),
  arbiterCorrectVerdicts,
};
writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, examples: result.examples.slice(0, 8) }, null, 2));
