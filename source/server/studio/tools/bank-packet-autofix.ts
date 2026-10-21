import { evaluateOpenAnswer, missingAnswerConcepts, normalizeAnswer } from "../../../shared/lesson-experience-score";
import type { OpenTask } from "../../../shared/lesson-experience";
import { OPTIONAL_ARRAY_KEYS } from "../bank-schema";
import { inflectedForms, spellingVariants, staleGeneratedForms, synonymsOf } from "../../../shared/hu-lexicon";

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
export type BankAutofixContext = { sectionIndex: number; allowedConceptIds: readonly string[]; /** Tételgyár T4′: a fejezet tanításának szövege. */ teachingText?: string };
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

const canon = (s: string) => s.toLocaleLowerCase("hu").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

/**
 * Spec 2026-10-21-ciklus3 (mért: 7 + 7 bankjavítókör a 98 futásban): a kategóriakvóta (`requiredDistinct`) gépi rendbetétele modellkör
 * nélkül — (1) a csoportok közt ismétlődő elem csak az első csoportban marad, az üres csoport kiesik, a darabszám legfeljebb a csoportok
 * száma (a séma szabálya); (2) a felsoroló feladat üres `required`-je a kvóta bármely elemét elfogadó csoport (a kvótát a
 * `requiredDistinct` méri, a `required` a sémakövetelmény).
 */
function fixDistinct(task: Obj, fixes: string[]): void {
  const id = typeof task.id === "string" ? task.id : "task[?]";
  if (!Array.isArray(task.requiredDistinct)) return;
  for (const rule of task.requiredDistinct) {
    if (!isObj(rule) || !Array.isArray(rule.from)) continue;
    const seen = new Set<string>();
    let removed = 0;
    // Review #354: a csoporton BELÜL esik ki az érvénytelen (nem szöveg) elem — a csoport többi érvényes eleme megmarad.
    const groups = (rule.from as unknown[]).filter(Array.isArray).map((g) => (g as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0));
    const from = groups.map((group) => group.filter((alt) => {
      const k = canon(alt);
      if (seen.has(k)) { removed++; return false; }
      seen.add(k);
      return true;
    })).filter((group) => group.length > 0);
    const changed = removed > 0 || JSON.stringify(from) !== JSON.stringify(rule.from);
    const clamped = typeof rule.count === "number" && rule.count > from.length && from.length > 0;
    // Review #354: az üres / érvénytelen csoport és a túl nagy darabszám ismétlődés nélkül is javul.
    if (changed && from.length) rule.from = from;
    if (clamped) rule.count = from.length;
    if (removed) fixes.push(`${id}: a kategóriakvóta ismétlődő elemei csak az első csoportban maradtak (${removed} elem)`);
    else if (changed && from.length) fixes.push(`${id}: a kategóriakvóta üres / érvénytelen elemei elhagyva`);
    if (clamped) fixes.push(`${id}: a kvóta darabszáma a csoportok számára szorítva (${from.length})`);
  }
  if (Array.isArray(task.required) && task.required.length === 0) {
    const any = [...new Set((task.requiredDistinct as unknown[]).filter(isObj).flatMap((r) => (Array.isArray(r.from) ? (r.from as unknown[]).filter(isStrArr).flat() : [])))];
    if (any.length) {
      task.required = [any];
      fixes.push(`${id}: az üres required a kategóriakvóta bármely elemét elfogadja (a kvótát a requiredDistinct méri)`);
    }
  }
}

function fixTask(task: Obj, fixes: string[], teachingText?: string): void {
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
  // Tételgyár T4′ (D2): a tanítás saját szóalakja, az írásmód-változat és a kézzel ellenőrzött rokon értelmű kifejezés a csoportba —
  // csak HOZZÁAD (a pontozó így a nem szó szerint egyező, de a tanítással azonos helyes választ is elfogadja); a minWords változatlan.
  for (const group of required) {
    // Review #231 (P1): a korábbi verzió értelmetlen, a tanítás által nem igazolt egybeírt alakjai ki (gyorsítótárból jövő csomagban is).
    const stale = staleGeneratedForms(group, teachingText, typeof task.sample === "string" ? task.sample : undefined);
    if (stale.length) { for (const x of stale) group.splice(group.indexOf(x), 1); fixes.push(`${id}: a tanítás által nem igazolt, gépi egybeírt alak kivéve (${stale.join(", ")})`); }
    const known = new Set(group.map((g) => normalizeAnswer(g)));
    const added: string[] = [];
    const add = (v: string) => { const n = normalizeAnswer(v); if (n && !known.has(n)) { known.add(n); added.push(v); } };
    for (const term of [...group]) {
      for (const v of spellingVariants(term, teachingText)) { add(v); for (const f of inflectedForms(v, teachingText)) add(f); }
      for (const f of inflectedForms(term, teachingText)) add(f);
      for (const s of synonymsOf(term)) add(s);
    }
    if (added.length) { group.push(...added); fixes.push(`${id}: a tanítás szóalakja / írásmód-változat / rokon értelmű kifejezés a rubrikába került (${added.join(", ")})`); }
  }
  task.required = required;
  // Spec 2026-10-01-gyokerok-egyben (2.2a): a pontozó csak alakhelyes adaton fut — a nyers modell-JSON típushibája (pl. szám a
  // `typedAnswers[].value` mezőben) itt nem dobhat kivételt; az ilyen tétel a sémához megy, és javító kört kap.
  const typedOk = !Array.isArray(task.typedAnswers) || task.typedAnswers.every(a => isObj(a) && typeof a.value === "string" && typeof a.part === "string");
  if (typeof task.minWords === "number" && typeof task.needsSentence === "boolean" && typeof task.sample === "string" && typedOk) {
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
      // docs/specs/2026-10-18-bank-ures-lista.md: a választható lista üresen = hiányzik (mentett / gyorsítótárból jövő csomagon is).
      if (bank !== "quiz") for (const key of OPTIONAL_ARRAY_KEYS[bank]) {
        if (Array.isArray(item[key]) && (item[key] as unknown[]).length === 0) {
          delete item[key];
          fixes.push(`${typeof item.id === "string" ? item.id : `${bank}[?]`}: üres ${key} elhagyva (= nincs)`);
        }
      }
      if (bank === "quiz") dedupeOptions(item, 3, fixes);
      if (bank === "methods") dedupeOptions(item, 2, fixes);
      if (bank === "tasks") { fixDistinct(item, fixes); fixTask(item, fixes, _ctx.teachingText); }
    }
    if (bank === "quiz") fixQuizIntent(items.filter(isObj), fixes);
  }
  return { packet, fixes };
}
