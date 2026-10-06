import { sql, type SQL } from "drizzle-orm";
import type { AttemptAnswer, AttemptQuestion } from "../../shared/lesson-attempt";
import { itemFingerprint } from "./catalog-item";

/**
 * Spec 2026-10-06-s8-tanuloi-eredmenyesseg: a leckelejátszó lezárt köreiből tételenkénti eredmény a katalógus-tétel tartalmi
 * lenyomatára. Determinisztikus, modellhívás nélkül; a katalógusba csak darabszám kerül (nincs felhasználó/lecke/kör).
 */
export type Outcome = { attempts: number; correct: number; independentCorrect: number };
export type OutcomeRecord = { fingerprint: string; attempts: number; correct: number; independent_correct: number };
export type OutcomeRound = { questions: AttemptQuestion[]; answers: Record<string, AttemptAnswer>; hints: string[] };

/** A kör kérdése a publikált lecke kvízének szó szerinti másolata (canonical-quiz-bank) → ugyanaz a lenyomat, mint a fúziós
 *  kinyerésé (fusion-extract: kind "quiz", prompt = question, options, correctIndex). */
export function attemptQuestionFingerprint(q: Pick<AttemptQuestion, "prompt" | "options" | "correctIndex">): string {
  return itemFingerprint({ kind: "quiz", prompt: q.prompt, options: q.options, correctIndex: q.correctIndex });
}

/** Egy lezárt kör: csak a megválaszolt kérdés számít; `independentCorrect` = helyes és segítség nélkül. */
export function roundOutcomes(round: OutcomeRound): Map<string, Outcome> {
  const out = new Map<string, Outcome>();
  for (const q of round.questions) {
    const answer = round.answers[q.id];
    if (!answer) continue;
    const fp = attemptQuestionFingerprint(q);
    const o = out.get(fp) ?? { attempts: 0, correct: 0, independentCorrect: 0 };
    o.attempts++;
    if (answer.correct) {
      o.correct++;
      if (!answer.usedHint && !round.hints.includes(q.id)) o.independentCorrect++;
    }
    out.set(fp, o);
  }
  return out;
}

export function addOutcomes(into: Map<string, Outcome>, from: Map<string, Outcome>): Map<string, Outcome> {
  for (const [fp, o] of from) {
    const t = into.get(fp) ?? { attempts: 0, correct: 0, independentCorrect: 0 };
    t.attempts += o.attempts; t.correct += o.correct; t.independentCorrect += o.independentCorrect;
    into.set(fp, t);
  }
  return into;
}

export function outcomeRecords(map: Map<string, Outcome>): OutcomeRecord[] {
  return [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([fingerprint, o]) => ({ fingerprint, attempts: o.attempts, correct: o.correct, independent_correct: o.independentCorrect }));
}

/** Növelő upsert (a lejátszó `finish` útjáról). A hívó savepointban futtatja; üres körnél nem ír. */
export function incrementOutcomesQuery(records: OutcomeRecord[]): SQL | null {
  if (!records.length) return null;
  return sql`INSERT INTO catalog_item_outcomes (fingerprint, attempts, correct, independent_correct, updated_at)
    SELECT x.fingerprint, x.attempts, x.correct, x.independent_correct, now()
    FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS x(fingerprint varchar, attempts integer, correct integer, independent_correct integer)
    ON CONFLICT (fingerprint) DO UPDATE SET attempts = catalog_item_outcomes.attempts + EXCLUDED.attempts,
      correct = catalog_item_outcomes.correct + EXCLUDED.correct,
      independent_correct = catalog_item_outcomes.independent_correct + EXCLUDED.independent_correct, updated_at = now()`;
}

export async function recordRoundOutcomes(executor: { execute: (query: SQL) => Promise<unknown> }, round: OutcomeRound): Promise<number> {
  const records = outcomeRecords(roundOutcomes(round));
  const query = incrementOutcomesQuery(records);
  if (query) await executor.execute(query);
  return records.length;
}
