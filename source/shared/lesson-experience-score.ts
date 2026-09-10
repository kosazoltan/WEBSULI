import type { OpenTask } from "./lesson-experience";

export function normalizeAnswer(value: string): string {
  return value.toLocaleLowerCase("hu").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
const tokensOf = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);
function stem(w: string): string {
  for (const suffix of ["ban", "ben", "bol", "rol", "tol", "nak", "nek", "val", "vel", "hoz", "hez", "ra", "re", "ba", "be", "ot", "et", "at", "ok", "ek", "k", "t", "n"]) {
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
  if (/\d/.test(token + word) || ["nem", "ne", "not", "no"].includes(word) || Math.min(token.length, word.length) < 5) return false;
  return stem(token) === stem(word) || distance(token, word) <= (Math.max(token.length, word.length) > 8 ? 2 : 1);
}
function conceptHit(tokens: string[], alternatives: string[]): boolean {
  return alternatives.some(phrase => tokensOf(phrase).every(word => tokens.some(token => wordHit(token, word))));
}
export type AnswerScore = { state: "ok" | "partial" | "fail"; score: number; reason: string };
export function evaluateOpenAnswer(answer: string, task: OpenTask): AnswerScore {
  const tokens = tokensOf(answer).slice(0, 500);
  if (tokens.length < task.minWords) return { state: "fail", score: 0, reason: "A válasz még túl rövid." };
  const hits = task.required.filter(c => conceptHit(tokens, c)).length;
  if (hits < Math.ceil(task.required.length / 2)) return { state: "fail", score: 0, reason: "A lényegi fogalmak még hiányoznak." };
  const concepts = [...task.required, ...task.bonus].flat();
  const ownWord = tokens.some(t => t.length >= 4 && !conceptHit([t], concepts));
  const connective = tokens.some(t => ["mert", "es", "ami", "amit", "hogy", "ezert", "igy", "mivel", "tehat", "ha", "akkor", "because", "and", "is", "are", "the"].includes(t));
  const hasUnexpectedNegation = tokens.some(t => ["nem", "not"].includes(t)) && !tokensOf(task.sample).some(t => ["nem", "not"].includes(t));
  if (hits < task.required.length || (task.needsSentence && !(ownWord && connective)) || hasUnexpectedNegation) {
    return { state: "partial", score: 0.5, reason: "Részben jó. Hasonlítsd össze a mintaválasszal, és fogalmazd meg az összefüggést." };
  }
  return { state: "ok", score: 1, reason: "A szükséges fogalmak és a megfogalmazás is rendben vannak." };
}

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
