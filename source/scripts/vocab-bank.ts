/**
 * Szóbank-eszköz a tartalomszeleteknek (végrehajtás S1/11. lépés, K.8.6–K.8.7).
 * Futtatás: `cd source && node --import tsx scripts/vocab-bank.ts <parancs> …`
 *
 *   report --lang <en|de|fr> [--terms]
 *   blind-export --lang <l> --level <n> --seed <s> --out <fájl> --key-out <fájl> [--canary <k>]
 *   blind-score --key <fájl> --answers <fájl> --out <fájl>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { VOCAB_TOPICS } from "../client/src/data/vocabBank/topics";
import { TOPIC_LEVEL_QUOTAS, phraseQuotaForCell } from "../client/src/data/vocabBank/quotas";
import { PLAN_MINIMUMS } from "../client/src/data/vocabBank/minimums";
import { minimumProblems, vocabBankProblems, vocabBankStats } from "../client/src/data/vocabBank/validate";
import type { VocabEntry, VocabLang, VocabLevel, VocabStage } from "../client/src/data/vocabBank/types";
import { VOCAB_EN, VOCAB_EN_STAGE } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_DE, VOCAB_DE_STAGE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_FR, VOCAB_FR_STAGE } from "../client/src/data/vocabBank/vocab-fr";
import { findTermInExample, generateVocabQuestion, type VocabQuestionType } from "../client/src/game-engine/vocab/questionGenerator";

/** Seedelt véletlen (mulberry32; a game-test-hooks.ts-é import.meta.env miatt Node-ban nem tölthető). */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const BANKS: Record<VocabLang, { entries: VocabEntry[]; stage: VocabStage }> = {
  en: { entries: VOCAB_EN, stage: VOCAB_EN_STAGE },
  de: { entries: VOCAB_DE, stage: VOCAB_DE_STAGE },
  fr: { entries: VOCAB_FR, stage: VOCAB_FR_STAGE },
};

export type BlindQuestion = { ref: string; prompt: string; options: string[]; example: string; exampleHu: string };
export type BlindKey = { ref: string; correctIndex: number; entryId: string; questionType: VocabQuestionType; canary?: true };
export type BlindAnswer = { ref: string; answer: number | null; ambiguous: boolean; ageOk: boolean; exampleOk: boolean; note: string };
export type BlindFlag = { ref: string; entryId: string; questionType: VocabQuestionType; reasons: string[]; answer: number | null; expected: number; note: string };

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) fail(`ismeretlen argumentum: ${a}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

function str(args: Record<string, string | true>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !v) fail(`hiányzó --${key}`);
  return v;
}

function langArg(args: Record<string, string | true>): VocabLang {
  const l = str(args, "lang");
  if (l !== "en" && l !== "de" && l !== "fr") fail(`--lang csak en | de | fr lehet (kapott: ${l})`);
  return l;
}

function intArg(args: Record<string, string | true>, key: string, min: number, max: number): number {
  const n = Number(str(args, key));
  if (!Number.isInteger(n) || n < min || n > max) fail(`--${key} egész ${min}–${max} között`);
  return n;
}

export function reportLines(lang: VocabLang, entries: VocabEntry[], stage: VocabStage, withTerms: boolean): { lines: string[]; problems: string[] } {
  const stats = vocabBankStats(entries);
  const problems = vocabBankProblems(entries, lang);
  const lines: string[] = [];
  lines.push(`Szóbank — ${lang} (stage: ${stage})`);
  lines.push(`total ${stats.total}`);
  lines.push(`szintenként: ${stats.perLevel.map((n, i) => `L${i} ${n}`).join(", ")}`);
  lines.push(`phrase ${stats.phrase} (${stats.total ? ((stats.phrase / stats.total) * 100).toFixed(1) : "0.0"}%)`);
  lines.push(`témánként: ${VOCAB_TOPICS.map(t => `${t} ${stats.perTopic[t]}`).join(", ")}`);

  const gaps: string[] = [];
  const phraseGaps: string[] = [];
  for (const topic of VOCAB_TOPICS) {
    TOPIC_LEVEL_QUOTAS[lang][topic].forEach((need, level) => {
      const cell = entries.filter(e => e.topic === topic && e.level === level);
      if (cell.length < need) gaps.push(`${topic} L${level}: ${cell.length}/${need}`);
      const phraseNeed = phraseQuotaForCell(need);
      const phraseHave = cell.filter(e => e.kind === "phrase").length;
      if (phraseHave < phraseNeed) phraseGaps.push(`${topic} L${level}: ${phraseHave}/${phraseNeed}`);
    });
  }
  lines.push(`kvóta-hiány (cella, van/kell): ${gaps.length ? "" : "nincs"}`);
  for (const g of gaps) lines.push(`  ${g}`);
  lines.push(`phrase-kvóta hiány (cella, van/kell): ${phraseGaps.length ? "" : "nincs"}`);
  for (const g of phraseGaps) lines.push(`  ${g}`);

  const planGaps = minimumProblems(stats, PLAN_MINIMUMS[lang]);
  lines.push(`terv 4.2 minimum: ${planGaps.length ? planGaps.join("; ") : "teljesül"}`);
  lines.push(`hibák: ${problems.length}`);
  for (const p of problems) lines.push(`  ${p}`);

  if (withTerms) {
    lines.push("term-lista (foglalt, szintenként):");
    for (let lv = 0; lv < 5; lv++) {
      lines.push(`  L${lv}: ${entries.filter(e => e.level === lv).map(e => e.term).join(" | ")}`);
    }
  }
  return { lines, problems };
}

/** A szint minden bejegyzéséből hu→cél és cél→hu (+ hiányos mondat, ha lehet) kérdés; kulcs külön fájlban. */
export function blindExport(lang: VocabLang, entries: VocabEntry[], level: VocabLevel, seed: number, canary: number):
  { questions: BlindQuestion[]; keys: BlindKey[]; skipped: string[] } {
  const rng = mulberry32(seed);
  const items: Array<{ q: Omit<BlindQuestion, "ref">; k: Omit<BlindKey, "ref"> }> = [];
  const skipped: string[] = [];
  for (const entry of entries.filter(e => e.level === level)) {
    const types: VocabQuestionType[] = ["hu-to-target", "target-to-hu"];
    if (findTermInExample(entry)) types.push("cloze");
    for (const type of types) {
      const quiz = generateVocabQuestion(entry, entries, type, rng);
      if (!quiz) { skipped.push(`${entry.id}:${type}`); continue; }
      items.push({
        q: { prompt: quiz.prompt, options: quiz.options, example: entry.example, exampleHu: entry.exampleHu },
        k: { correctIndex: quiz.correctIndex, entryId: entry.id, questionType: type },
      });
    }
  }
  // Seedelt keverés, hogy egy bejegyzés kérdései ne álljanak egymás mellett.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  const width = Math.max(4, String(items.length).length);
  const questions: BlindQuestion[] = [];
  const keys: BlindKey[] = [];
  items.forEach((it, i) => {
    const ref = `${lang}${level}-q${String(i + 1).padStart(width, "0")}`;
    questions.push({ ref, ...it.q });
    keys.push({ ref, ...it.k });
  });
  // Kanári: k véletlen tétel kulcsa szándékosan rossz — a figyelmes megoldó ezeket jelzi.
  const canaryCount = Math.min(canary, keys.length);
  const picked = new Set<number>();
  while (picked.size < canaryCount) picked.add(Math.floor(rng() * keys.length));
  for (const i of picked) {
    const k = keys[i]!;
    k.correctIndex = (k.correctIndex + 1 + Math.floor(rng() * 3)) % 4;
    k.canary = true;
  }
  return { questions, keys, skipped };
}

function asArray<T>(raw: unknown, field: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    for (const k of [field, "items", "answers"]) {
      const v = (raw as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  fail(`a fájl nem tömb és nincs „${field}” tömbje`);
}

export function blindScore(keys: BlindKey[], answers: BlindAnswer[]): { checked: number; flagged: BlindFlag[]; canaryFound: number; canaryTotal: number } {
  const byRef = new Map(answers.map(a => [a.ref, a]));
  const flagged: BlindFlag[] = [];
  let canaryFound = 0;
  let canaryTotal = 0;
  for (const k of keys) {
    const a = byRef.get(k.ref);
    const reasons: string[] = [];
    const answer = a && Number.isInteger(a.answer) ? (a.answer as number) : null;
    if (!a) reasons.push("nincs válasz");
    else if (answer === null) reasons.push("a megoldó nem választott");
    else if (answer !== k.correctIndex) reasons.push(`rossz válasz (${answer}, kulcs ${k.correctIndex})`);
    if (a?.ambiguous === true) reasons.push("kétértelmű");
    if (a && a.ageOk === false) reasons.push("korosztálynak nem való");
    if (a && a.exampleOk === false) reasons.push("hibás példamondat / fordítás");
    if (k.canary) {
      canaryTotal++;
      // Csak a TÉNYLEGES, a rontott kulcstól eltérő válasz számít észlelésnek (a hiányzó válasz nem).
      if (answer !== null && answer !== k.correctIndex) canaryFound++;
      continue;
    }
    if (reasons.length) flagged.push({ ref: k.ref, entryId: k.entryId, questionType: k.questionType, reasons, answer, expected: k.correctIndex, note: a?.note ?? "" });
  }
  return { checked: keys.length, flagged, canaryFound, canaryTotal };
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === "report") {
    const lang = langArg(args);
    const { entries, stage } = BANKS[lang];
    const { lines, problems } = reportLines(lang, entries, stage, args.terms === true);
    process.stdout.write(`${lines.join("\n")}\n`);
    process.exit(problems.length ? 1 : 0);
  }
  if (command === "blind-export") {
    const lang = langArg(args);
    const level = intArg(args, "level", 0, 4) as VocabLevel;
    const seed = intArg(args, "seed", 0, 2 ** 31 - 1);
    const canary = args.canary === undefined ? 0 : intArg(args, "canary", 0, 1000);
    const { questions, keys, skipped } = blindExport(lang, BANKS[lang].entries, level, seed, canary);
    writeFileSync(str(args, "out"), `${JSON.stringify({ lang, level, seed, count: questions.length, items: questions }, null, 1)}\n`, "utf8");
    writeFileSync(str(args, "key-out"), `${JSON.stringify({ lang, level, seed, canary, items: keys }, null, 1)}\n`, "utf8");
    process.stdout.write(`kérdés: ${questions.length}, kanári: ${Math.min(canary, keys.length)}, kihagyva: ${skipped.length}${skipped.length ? ` (${skipped.join(", ")})` : ""}\n`);
    process.exit(0);
  }
  if (command === "blind-score") {
    const keys = asArray<BlindKey>(JSON.parse(readFileSync(str(args, "key"), "utf8")), "items");
    const answers = asArray<BlindAnswer>(JSON.parse(readFileSync(str(args, "answers"), "utf8")), "answers");
    const result = blindScore(keys, answers);
    writeFileSync(str(args, "out"), `${JSON.stringify(result.flagged, null, 1)}\n`, "utf8");
    process.stdout.write(`ellenőrzött: ${result.checked}, jelzett: ${result.flagged.length}, kanári: ${result.canaryFound}/${result.canaryTotal}\n`);
    // A kanári-kapu: ha a megoldó nem vette észre mind, a futás érvénytelen (K.8.7/3).
    process.exit(result.canaryFound === result.canaryTotal ? 0 : 2);
  }
  fail("használat: report --lang <l> [--terms] | blind-export … | blind-score … (lásd a fájl fejlécét)");
}

if (process.argv[1] && /vocab-bank\.ts$/.test(process.argv[1])) main();
