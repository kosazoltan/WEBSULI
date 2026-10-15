/**
 * Tételgyár T2.1b (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md; tulajdonosi döntés 2026-10-15: gépi kalibráció):
 * a nyílt feladat rubrikája a válaszkulcs-tesztesetekből, MODELLHÍVÁS NÉLKÜL igazodik. Minden lépés után őr: a minta teljes pontot kap, és
 * egyik hibás eset sem — ha sérül, az adott lépés visszavonódik. A pontozó nem változik (a régi leckék pontozása azonos).
 */
import type { AnswerKeyCases } from "./answer-key-tests";
import type { OpenTask } from "./lesson-experience";
import { evaluateOpenAnswer, isTypedTask, missingAnswerConcepts, normalizeAnswer } from "./lesson-experience-score";
import { inflectedForms, synonymsOf } from "./hu-lexicon";

const NEGATIONS = new Set(["nem", "ne", "sem", "se", "nincs", "sincs"]);
const words = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);

/** Közös szótő: közös kezdet ≥ 5 betű, és mindkét szó maradéka legfeljebb 5 betű (a „rovar” nem rokona a „rovarbeporzás”-nak). */
function sharedStem(a: string, b: string): boolean {
  if (a === b || /\d/.test(a + b) || NEGATIONS.has(a) || NEGATIONS.has(b)) return false;
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n >= 5 && a.length - n <= 5 && b.length - n <= 5;
}

/** A válasz azon szavai/kifejezései, amelyek a csoport valamely tagjával igazoltan rokonok (adatbank vagy közös szótő). */
function relatedForms(group: readonly string[], answer: string): string[] {
  const out = new Set<string>();
  const answerWords = new Set(words(answer));
  for (const member of group) {
    for (const form of inflectedForms(member, answer)) out.add(form);
    for (const syn of synonymsOf(member)) if (words(syn).every((w) => answerWords.has(w))) out.add(syn);
    const parts = words(member);
    if (parts.length === 1) for (const w of answerWords) if (sharedStem(parts[0], w)) out.add(w);
  }
  const existing = new Set(group.map((m) => normalizeAnswer(m)));
  return [...out].filter((f) => !existing.has(normalizeAnswer(f)));
}

/** Az őr: a minta `ok`, egyik hibás eset sem `ok`. */
function guardHolds(task: OpenTask, cases: AnswerKeyCases): boolean {
  return evaluateOpenAnswer(task.sample, task).state === "ok" && cases.wrong.every((w) => evaluateOpenAnswer(w.text, task).state !== "ok");
}

export type Calibration = { task: OpenTask; changes: string[] };

/** A bónuszba sorolás küszöbe: hány helyes esetből kell hiányoznia a csoportnak (alapból legalább 2 — második tulajdonosi döntés 2026-10-15). */
export type CalibrationOptions = { demoteWhenMissingIn?: (correctCount: number) => number };
const AT_LEAST_TWO = (n: number) => Math.min(2, n);

export function calibrateRubric(original: OpenTask, cases: AnswerKeyCases | null, options: CalibrationOptions = {}): Calibration {
  if (!cases || isTypedTask(original) || !guardHolds(original, cases)) return { task: original, changes: [] };
  let task: OpenTask = { ...original, required: original.required.map((g) => [...g]), bonus: original.bonus.map((g) => [...g]) };
  const changes: string[] = [];
  const failing = () => cases.correct.filter((a) => evaluateOpenAnswer(a, task).state !== "ok");
  const tryStep = (next: OpenTask, change: string) => {
    if (!guardHolds(next, cases)) return false;
    task = next;
    changes.push(change);
    return true;
  };

  // 1. Alakfelvétel: a helyes válasz rokon szóalakja a hiányzó csoportba.
  // Az index stabil: ez a lépés csoportot nem vesz ki, csak bővít (a csoport tömbje lépésenként új).
  for (const answer of failing()) {
    const missingIdx = task.required.map((g, i) => (missingAnswerConcepts(answer, { required: [g] }).length ? i : -1)).filter((i) => i >= 0);
    for (const index of missingIdx) {
      const group = task.required[index];
      const forms = relatedForms(group, answer);
      if (!forms.length) continue;
      const required = task.required.map((g, i) => (i === index ? [...g, ...forms] : g));
      tryStep({ ...task, required }, `alak: ${JSON.stringify(group[0])} csoport + ${JSON.stringify(forms)}`);
    }
  }

  // 2. Bónuszba sorolás: a helyes esetek többségéből hiányzó kötelező csoport, a legritkábban teljesülővel kezdve; ≥ 1 kötelező marad.
  const missCount = (g: readonly string[]) => cases.correct.filter((a) => missingAnswerConcepts(a, { required: [g as string[]] }).length > 0).length;
  const threshold = (options.demoteWhenMissingIn ?? AT_LEAST_TWO)(cases.correct.length);
  const candidates = task.required.filter((g) => missCount(g) >= threshold).sort((a, b) => missCount(b) - missCount(a));
  for (const group of candidates) {
    if (task.required.length <= 1) break;
    const next = { ...task, required: task.required.filter((g) => g !== group), bonus: [...task.bonus, group] };
    tryStep(next, `bónuszba: ${JSON.stringify(group[0])} (a helyes válaszok ${missCount(group)}/${cases.correct.length}-ából hiányzik)`);
  }

  // 3–4. Mondatfeltétel és szóminimum — egymást elfedhetik (a rövid válasz a kötőszó hiányát is mutatja), ezért legfeljebb két körben.
  const shortest = Math.max(1, Math.min(...cases.correct.map((a) => words(a).length)));
  for (let round = 0; round < 2; round++) {
    // 3. Mondatfeltétel: ha a helyes eset csak a kötőszó hiánya miatt nem teljes pont.
    if (task.needsSentence && failing().some((a) => evaluateOpenAnswer(a, { ...task, needsSentence: false }).state === "ok")) {
      tryStep({ ...task, needsSentence: false }, "mondatfeltétel kikapcsolva (a helyes válasz csak a kötőszó miatt bukott)");
    }
    // 4. Szóminimum: ha a helyes eset csak a hossza miatt bukik.
    if (shortest < task.minWords && failing().some((a) => evaluateOpenAnswer(a, { ...task, minWords: shortest }).state === "ok")) {
      tryStep({ ...task, minWords: shortest }, `szóminimum ${task.minWords} → ${shortest}`);
    }
  }
  return { task, changes };
}
