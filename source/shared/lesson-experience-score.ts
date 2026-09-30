import type { OpenTask } from "./lesson-experience";
import { answerWindow, gradeTypedAnswers } from "./answer-value";

/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (U1): a pontozó két úton fut.
 * - v1 (`evaluateOpenAnswerV1`): a régi kulcsszó-pontozó, VÁLTOZATLANUL — minden régi lecke és a HTML-leckék `ee_evaluate`
 *   párja így pontozódik (tests/lesson-html-score.test.ts). Ismert maradó hibái: sorrend- és törtvak illesztés (H31),
 *   globális tagadás-heurisztika (H1/H2 nem teljesen lezárt).
 * - v2 (`evaluateOpenAnswerV2`): csak a típusos mezőt (`typedAnswers`, `requiredDistinct`) hordozó feladatra; a részeredmények
 *   értéke dönt, a `required` a szöveges részt méri, a műveleti jel a normalizálásban megmarad.
 * A szabályok szövege a modellnek (`OPEN_ANSWER_RULES_HU`) ugyanezekből a konstansokból generálódik — a skill és a
 * kód nem csúszhat el (B4).
 */

/** Toldalékok, amelyeket a szóillesztés (≥ 4 betűs szónál) egyszer levág. */
export const STEM_SUFFIXES = ["juk", "unk", "ban", "ben", "bol", "rol", "tol", "nak", "nek", "val", "vel", "hoz", "hez", "uk", "ja", "je", "ra", "re", "ba", "be", "ot", "et", "at", "ok", "ek", "k", "t", "n"] as const;
/** Kötőszavak/névelők, amelyek egyike kell a `needsSentence` feladat „mondat” feltételéhez. */
export const SENTENCE_CONNECTIVES = ["mert", "es", "olyan", "ami", "amit", "azt", "hogy", "lehet", "tudom", "tudjuk", "mint", "ezert", "igy", "mivel", "tehat", "ha", "akkor", "vagyis", "mig", "a", "az", "because", "and", "is", "are", "there", "have", "has", "do", "does", "an", "the", "some", "any", "how", "much", "many", "of", "on", "in"] as const;
const NEGATIONS = ["nem", "ne", "not", "no"] as const;

export function normalizeAnswer(value: string): string {
  const normalized = value.toLocaleLowerCase("hu").normalize("NFD").replace(/\p{M}/gu, "").replace(/(\d)[,.](?=\d)/g, "$1.").replace(/−/g, "-");
  return (normalized.match(/[+-]?\d+(?:\.\d+)?|[\p{L}]+/gu) ?? []).map(t => t.replace(/^\+(?=\d)/, "")).join(" ");
}
/** v2: a műveleti jel és a törtvonal is token — a „8 : 2” és a „8 · 2”, a „1/2” és a „2/1” különbözik. */
export function normalizeAnswerV2(value: string): string {
  const normalized = value.toLocaleLowerCase("hu").normalize("NFD").replace(/\p{M}/gu, "").replace(/(\d)[,.](?=\d)/g, "$1.").replace(/[−–]/g, "-").replace(/[×*]/g, "·").replace(/÷/g, ":");
  return (normalized.match(/\d+(?:\.\d+)?(?:\/\d+)?|[\p{L}]+|[+\-·:]/gu) ?? []).join(" ");
}
const tokensOf = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);
const tokensOfV2 = (s: string) => normalizeAnswerV2(s).split(/\s+/).filter(Boolean);
function stem(w: string): string {
  for (const suffix of STEM_SUFFIXES) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < b.length; j++) row.push(Math.min(row[j] + 1, prev[j + 1] + 1, prev[j] + Number(a[i] !== b[j])));
    prev = row;
  }
  return prev[b.length];
}
function wordHit(token: string, word: string): boolean {
  if (token === word) return true;
  // Numbers, negation and short words may never be "corrected" into another answer.
  if (/\d/.test(token + word) || (NEGATIONS as readonly string[]).includes(word)) return false;
  if (Math.min(token.length, word.length) >= 4 && (stem(token) === word || token === stem(word) || stem(token) === stem(word))) return true;
  if (Math.min(token.length, word.length) < 5) return false;
  return distance(token, word) <= (Math.max(token.length, word.length) > 8 ? 2 : 1);
}
function conceptHit(tokens: string[], alternatives: readonly string[], tokenize: (s: string) => string[] = tokensOf): boolean {
  return alternatives.some(phrase => tokenize(phrase).every(word => tokens.some(token => wordHit(token, word))));
}
const OPERATOR_TOKEN = /^[+\-·:]$/;
/**
 * Kategóriakvóta (v2): hány KÜLÖNBÖZŐ csoportot talál a válasz úgy, hogy egy válasz-token csak egy csoportot igazolhat
 * (review #159, P2: az „alma” egyetlen előfordulása nem két példa, ha két csoportban is szerepel).
 */
function distinctHits(tokens: string[], groups: ReadonlyArray<readonly string[]>): number {
  const used = new Set<number>();
  let found = 0;
  for (const group of groups) {
    let hit: number[] | null = null;
    for (const phrase of group) {
      const indices: number[] = [];
      const complete = tokensOfV2(phrase).every(word => {
        const i = tokens.findIndex((token, k) => !used.has(k) && !indices.includes(k) && wordHit(token, word));
        if (i >= 0) indices.push(i);
        return i >= 0;
      });
      if (complete) { hit = indices; break; }
    }
    if (hit) { hit.forEach(i => used.add(i)); found++; }
  }
  return found;
}
/** Generation diagnostics use the exact learner-side matcher, not another approximation. */
export function missingAnswerConcepts(answer: string, task: Pick<OpenTask, "required">): string[][] {
  const tokens = tokensOf(answer).slice(0, 500);
  return task.required.filter(group => !conceptHit(tokens, group));
}
export type AnswerScore = { state: "ok" | "partial" | "fail"; score: number; reason: string };

/** A típusos (v2) feladat ismérve: van részeredmény-lista vagy kategóriakvóta. */
export const isTypedTask = (task: Pick<OpenTask, "typedAnswers" | "requiredDistinct">): boolean => Boolean(task.typedAnswers?.length || task.requiredDistinct?.length);

/** v1 — a régi kulcsszó-pontozó, változatlan viselkedéssel (régi leckék, HTML-pontozó paritás). */
export function evaluateOpenAnswerV1(answer: string, task: OpenTask): AnswerScore {
  const tokens = tokensOf(answer).slice(0, 500);
  if (tokens.length < task.minWords) return { state: "fail", score: 0, reason: "A válasz még túl rövid." };
  const hits = task.required.filter(c => conceptHit(tokens, c)).length;
  if (hits < Math.ceil(task.required.length / 2)) return { state: "fail", score: 0, reason: "A lényegi fogalmak még hiányoznak." };
  // A correct sentence may use only rubric words. Off-rubric filler cannot prove
  // originality, and adding a bonus term must never lower an otherwise correct score.
  const connective = tokens.some(t => (SENTENCE_CONNECTIVES as readonly string[]).includes(t));
  const hasUnexpectedNegation = tokens.some(t => ["nem", "not"].includes(t)) && !tokensOf(task.sample).some(t => ["nem", "not"].includes(t));
  if (hits < task.required.length || (task.needsSentence && !connective) || hasUnexpectedNegation) {
    const reason = hits < task.required.length ? `Részben jó. Még ${task.required.length - hits} kötelező fogalom hiányzik.` : hasUnexpectedNegation ? "A tagadás eltér a mintaválasz állításától; ellenőrizd a jelentést." : "A fogalmak megvannak; fogalmazd őket összefüggő mondattá.";
    return { state: "partial", score: 0.5, reason };
  }
  return { state: "ok", score: 1, reason: "A szükséges fogalmak és a megfogalmazás is rendben vannak." };
}

/**
 * v2 — típusos feladat. Elsőbbség: a részeredmények értéke dönt a számról (mind helyes → tovább a szöveges rubrikára;
 * egy sem → 0; némelyik → legfeljebb fél pont); a kategóriakvóta különböző elemeket számol (egy szinonimacsoport = 1 elem);
 * a `required` a szöveges részt méri; minWords/needsSentence/tagadás a v1 szabálya szerint.
 */
export function evaluateOpenAnswerV2(rawAnswer: string, task: OpenTask): AnswerScore {
  // Review #159: a v2 tokenlista műveleti jelet is tartalmaz — a szószám (1. szabály: az írásjel 0 szó) és a típusos érték
  // ugyanabból az 500 szavas ablakból számol.
  const answer = answerWindow(rawAnswer);
  const tokens = tokensOfV2(answer);
  const wordCount = tokens.filter(t => !OPERATOR_TOKEN.test(t)).length;
  if (wordCount < task.minWords) return { state: "fail", score: 0, reason: "A válasz még túl rövid." };
  let partialReason: string | null = null;
  if (task.typedAnswers?.length) {
    const grade = gradeTypedAnswers(answer, task.typedAnswers);
    if (grade.undecidable) return { state: "fail", score: 0, reason: "A feladat referenciaértéke nem értelmezhető; szólj a tanárnak." };
    if (grade.correct === 0) return { state: "fail", score: 0, reason: grade.verdicts[0]?.reason ?? "A végeredmény hiányzik vagy hibás." };
    if (grade.correct < grade.total) partialReason = `Részben jó: ${grade.total - grade.correct} részeredmény hibás vagy hiányzik. ${grade.verdicts.find(v => !v.ok)?.reason ?? ""}`.trim();
  }
  for (const rule of task.requiredDistinct ?? []) {
    const distinct = distinctHits(tokens, rule.from);
    if (distinct === 0) return { state: "fail", score: 0, reason: `A(z) „${rule.category}” kategóriából egy példa sincs a válaszban.` };
    if (distinct < rule.count) partialReason ??= `Részben jó: a(z) „${rule.category}” kategóriából ${rule.count} különböző példa kell, ${distinct} van.`;
  }
  const hits = task.required.filter(c => conceptHit(tokens, c, tokensOfV2)).length;
  if (task.required.length && hits < Math.ceil(task.required.length / 2) && !task.typedAnswers?.length) return { state: "fail", score: 0, reason: "A lényegi fogalmak még hiányoznak." };
  const connective = tokens.some(t => (SENTENCE_CONNECTIVES as readonly string[]).includes(t));
  const hasUnexpectedNegation = tokens.some(t => ["nem", "not"].includes(t)) && !tokensOfV2(task.sample).some(t => ["nem", "not"].includes(t));
  if (partialReason || hits < task.required.length || (task.needsSentence && !connective) || hasUnexpectedNegation) {
    const reason = partialReason ?? (hits < task.required.length ? `Részben jó. Még ${task.required.length - hits} kötelező fogalom hiányzik.` : hasUnexpectedNegation ? "A tagadás eltér a mintaválasz állításától; ellenőrizd a jelentést." : "A fogalmak megvannak; fogalmazd őket összefüggő mondattá.");
    return { state: "partial", score: 0.5, reason };
  }
  return { state: "ok", score: 1, reason: "A végeredmény, a szükséges fogalmak és a megfogalmazás is rendben vannak." };
}

/** A tanulói és a mintaválasz pontozója: a feladat mezői döntik el az utat (típusos → v2, különben a változatlan v1). */
export function evaluateOpenAnswer(answer: string, task: OpenTask): AnswerScore {
  return isTypedTask(task) ? evaluateOpenAnswerV2(answer, task) : evaluateOpenAnswerV1(answer, task);
}

/**
 * B4: a pontozó szerződése a bank-szerepnek — a KÓD konstansaiból generálva, nem kézzel írt utánzat.
 * (U2 köti a bank promptjába.)
 */
export const OPEN_ANSWER_RULES_HU = [
  "A NYÍLT FELADAT PONTOZÓJA (program, nem ember — ezek a tényleges szabályok):",
  `1. Szó = szám vagy betűsor; a kötőjeles szó 2 szó, az írásjel 0 szó; csak az első 500 szó számít. minWords: ennél kevesebb szó = 0 pont — a minWords a LEGRÖVIDEBB teljes helyes válasz szószáma legyen, nem a minta hosszáé.`,
  `2. required = ÉS-csoportok; egy csoporton belül VAGY-alternatívák. Többszavas alternatíva: minden szava külön, bármilyen sorrendben. Szóillesztés: azonos alak; ≥ 4 betűs szónál EGY toldalék (${STEM_SUFFIXES.join(", ")}) lehagyva is; ≥ 5 betűnél 1 elütés (8 betű fölött 2). Szám és a tagadószavak (${NEGATIONS.join(", ")}) csak pontosan.`,
  "3. Pontérték: a csoportok kevesebb mint felének találata → 0; nem mind → 0,5 („Még N kötelező fogalom hiányzik”); mind → 1, ha a needsSentence és a tagadás is rendben.",
  `4. needsSentence: legalább egy kötőszó/névelő kell ezek közül: ${SENTENCE_CONNECTIVES.slice(0, 19).join(", ")}; különben 0,5. Tagadás: ha a válaszban van „nem/not”, a mintában viszont nincs → 0,5.`,
  "5. TÍPUSOS (zárt matematikai) feladat: typedAnswers = [{part, kind: number|fraction|expression, value, unit?, form?}] részfeladatonként, SORRENDBEN (felcserélt részeredmény hibás). Az érték dönt: 2/1 ≠ 1/2; 0,5 = 1/2 csak form: any esetén; form: simplified-fraction → csak egyszerűsített tört (2/4, 0,5 nem); form: decimal → tizedes/egész alak; form: intermediate-step → a KÉRT köztes kifejezés szerepeljen (35 + 64 − 12), az értékazonos más alak (35 + 8 · 8 − 12) nem; unit → a szám után a mértékegység kötelező. A required ekkor csak a szöveges részt méri; a végeredményt NE tedd required-csoportba.",
  "6. requiredDistinct = [{category, from: [[szinonimák]…], count}]: kategóriánként legalább count KÜLÖNBÖZŐ elem; egy szinonimacsoport egy elem (két szinonima nem két példa). Ezt használd, ha a kérdés „N példát” kér egy halmazból — ne tegyél önkényes mintát kötelezővé.",
  "7. A sample-nek a saját rubrikán 1 pontot kell kapnia (a program ellenőrzi); a program a referenciaértéket a kérdés kifejezéséből újraszámolja — eltérés csomaghiba.",
].join("\n");

export function scoreSummary(points: number, total: number) {
  const percent = total > 0 ? Math.round(100 * points / total) : 0;
  const grade = percent >= 90 ? 5 : percent >= 75 ? 4 : percent >= 60 ? 3 : percent >= 40 ? 2 : 1;
  const label = ["", "Elégtelen", "Elégséges", "Közepes", "Jó", "Jeles"][grade];
  return { points, total, percent, grade, label };
}
export function sampleIds<T extends { id: string }>(bank: readonly T[], count: number, random = Math.random): string[] {
  const ids = bank.map(t => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}

/** Stable display order; saved picks and feedback always retain the original bank index. */
export function quizOptionIndices(question: { id: string; question: string; options: readonly string[] }): number[] {
  let seed = 2166136261;
  for (const character of `${question.id}:${question.question}`) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const indices = question.options.map((_, index) => index);
  for (let i = indices.length - 1; i > 0; i--) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const j = (seed >>> 0) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/** Keep oral practice present in every round, not only somewhere in the full bank. */
export function sampleTaskIds(bank: readonly OpenTask[], count = 15, random = Math.random): string[] {
  const oral = new Set(sampleIds(bank.filter(t => t.mode === "oral"), Math.min(2, count), random));
  const selected = [...oral, ...sampleIds(bank.filter(t => !oral.has(t.id)), count - oral.size, random)];
  return sampleIds(selected.map(id => ({ id })), count, random);
}
