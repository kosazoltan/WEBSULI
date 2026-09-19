import { evaluateOpenAnswer, missingAnswerConcepts, normalizeAnswer } from "../../../shared/lesson-experience-score";
import type { OpenTask } from "../../../shared/lesson-experience";

/**
 * Eszköz (tulajdonosi kérés 2026-09-19): determinisztikus bankcsomag-javítás MODELLHÍVÁS NÉLKÜL.
 *
 * A mért javító körök (49 fogalmas térkép, job 6cb1bc89 és a Műveleti sorrend futásai) nagy
 * része formai: ismétlődő opció, a mintaválasz ragozott alakja hiányzik a rubrikából, hiányzó
 * kvíz-intent. A kötés (sectionIndex, coversConceptIds) NEM formai: csomagon kívüli címke azt
 * jelenti, hogy a kérdés másról szól — ezt a modell javítja a pontos hibaüzenetből
 * (tests/bank-binding-diagnostics).
 * Ezeket kód javítja a séma-ellenőrzés ELŐTT; ami tartalmi (rossz megoldás, hiányzó tétel),
 * az továbbra is a modellhez megy vissza. Soha nem talál ki tartalmat: csak szűr, egyértelműsít,
 * és a mintaválaszban TÉNYLEGESEN szereplő szóalakot ad a rubrikához.
 */

/** Kept for the call site and the CLI; binding (sectionIndex, coversConceptIds) is CONTENT and is never touched here. */
export type BankAutofixContext = { sectionIndex: number; allowedConceptIds: readonly string[] };
export type BankAutofixResult = { packet: unknown; fixes: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const key = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase("hu");

/** Stem prefix used to match a rubric term with a word form in the sample (≥4 chars, drops ≤3-char suffix). */
function stemPrefix(term: string): string | null {
  const n = normalizeAnswer(term).split(" ")[0] ?? "";
  if (n.length < 4) return null;
  return n.slice(0, Math.max(4, n.length - 3));
}

function dedupeOptions(item: Obj, minOptions: number, fixes: string[]): void {
  if (!isStrArr(item.options)) return;
  const seen = new Map<string, number>();
  const keep: number[] = [];
  item.options.forEach((o, i) => { const k = key(o); if (!seen.has(k)) { seen.set(k, i); keep.push(i); } });
  if (keep.length === item.options.length || keep.length < minOptions) return;
  const id = typeof item.id === "string" ? item.id : "?";
  const options = item.options;
  const correct = typeof item.correctIndex === "number" ? item.correctIndex : -1;
  const correctKey = correct >= 0 && correct < options.length ? key(options[correct]) : null;
  const nextOptions = keep.map(i => options[i]);
  item.options = nextOptions;
  if (isStrArr(item.feedbackPerOption) && item.feedbackPerOption.length >= keep.length) item.feedbackPerOption = keep.map(i => (item.feedbackPerOption as string[])[i]);
  if (correctKey !== null) item.correctIndex = nextOptions.findIndex(o => key(o) === correctKey);
  fixes.push(`${id}: ismétlődő válaszlehetőség elhagyva`);
}

function fixTask(task: Obj, fixes: string[]): void {
  const id = typeof task.id === "string" ? task.id : "task[?]";
  if (typeof task.sample !== "string" || !Array.isArray(task.required)) return;
  // minWords is NEVER lowered here: a short sample means the model must write a fuller sample
  // (spec: "short sample repair … without lowering the threshold").
  const sampleTokens = normalizeAnswer(task.sample).split(/\s+/).filter(Boolean);
  const required = task.required.filter(isStrArr);
  if (required.length !== task.required.length || !required.length) return;
  const probe = { required } as Pick<OpenTask, "required">;
  for (const group of missingAnswerConcepts(task.sample, probe)) {
    const added = new Set<string>();
    for (const term of group) {
      const prefix = stemPrefix(term);
      if (!prefix) continue;
      for (const token of sampleTokens) if (token.startsWith(prefix) && !group.some(g => normalizeAnswer(g) === token)) added.add(token);
    }
    if (!added.size) continue;
    const next = [...group, ...added];
    const trial = required.map(g => (g === group ? next : g));
    if (missingAnswerConcepts(task.sample, { required: trial }).length < missingAnswerConcepts(task.sample, probe).length) {
      group.push(...added); fixes.push(`${id}: a minta szóalakja a rubrikába került (${[...added].join(", ")})`);
    }
  }
  task.required = required;
  if (typeof task.minWords === "number" && typeof task.needsSentence === "boolean") {
    const asTask = task as unknown as OpenTask;
    if (asTask.needsSentence && evaluateOpenAnswer(task.sample, asTask).score !== 1 && evaluateOpenAnswer(task.sample, { ...asTask, needsSentence: false }).score === 1) {
      task.needsSentence = false; fixes.push(`${id}: needsSentence=false (a minta kötőszó nélkül is teljes)`);
    }
  }
}

function fixQuizIntent(quiz: Obj[], fixes: string[]): void {
  const seen = new Map<string, number>();
  for (const q of quiz) {
    const concept = isStrArr(q.coversConceptIds) ? q.coversConceptIds[0] : undefined;
    if (!concept) continue;
    const n = seen.get(concept) ?? 0;
    seen.set(concept, n + 1);
    if (q.intent === "recall" || q.intent === "apply") continue;
    q.intent = n % 2 === 0 ? "recall" : "apply";
    fixes.push(`${typeof q.id === "string" ? q.id : "quiz[?]"}: intent=${q.intent}`);
  }
}

export function autofixBankPacket(candidate: unknown, _ctx: BankAutofixContext): BankAutofixResult {
  if (!isObj(candidate)) return { packet: candidate, fixes: [] };
  const packet = structuredClone(candidate);
  const fixes: string[] = [];
  for (const bank of ["methods", "tasks", "quiz"] as const) {
    const items = packet[bank];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isObj(item)) continue;
      if (bank === "quiz") dedupeOptions(item, 3, fixes);
      if (bank === "methods") dedupeOptions(item, 2, fixes);
      if (bank === "tasks") fixTask(item, fixes);
    }
    if (bank === "quiz") fixQuizIntent(items.filter(isObj), fixes);
  }
  return { packet, fixes };
}
