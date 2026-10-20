/**
 * Tételgyár T2 (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md): válaszkulcs-tesztek — a nyílt feladat rubrikáját
 * a VALÓDI pontozó ítéli meg előre megírt helyes és hibás válaszokon (modell-vélemény helyett megismételhető, konkrét eset).
 * Tiszta modul: a pontozó nem változik, csak futtatjuk.
 */
import type { OpenTask } from "./lesson-experience";
import { answerTokensCover, evaluateOpenAnswer, isComputedTask, missingAnswerConcepts, missingPhrases } from "./lesson-experience-score";

export const WRONG_KINDS = ["tevhit", "forditott", "hianyos", "temaidegen"] as const;
export type WrongKind = (typeof WRONG_KINDS)[number];
export type AnswerKeyCases = { correct: string[]; wrong: Array<{ kind: WrongKind; text: string }> };

export const ANSWER_KEY_LIMITS = { correctMin: 3, correctMax: 6, wrongMin: 2, wrongMax: 5, textMax: 300 } as const;

const KIND_HU: Record<WrongKind, string> = { tevhit: "tévhit", forditott: "fordított irány", hianyos: "hiányos", temaidegen: "témaidegen" };
const quote = (s: string) => `„${s.length > 120 ? `${s.slice(0, 117)}…` : s}”`;

/** A modell válaszából a használható esetkészlet (méret- és alakkorláttal); `null`, ha nincs elég eset az ítélethez. */
export function sanitizeAnswerKeyCases(raw: unknown): AnswerKeyCases | null {
  const o = (raw ?? {}) as { correct?: unknown; wrong?: unknown };
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const correct = (Array.isArray(o.correct) ? o.correct : []).map(text).filter((s) => s && s.length <= ANSWER_KEY_LIMITS.textMax)
    .slice(0, ANSWER_KEY_LIMITS.correctMax);
  const wrong = (Array.isArray(o.wrong) ? o.wrong : [])
    .map((w) => ({ kind: (w as { kind?: unknown })?.kind, text: text((w as { text?: unknown })?.text) }))
    .filter((w): w is { kind: WrongKind; text: string } => (WRONG_KINDS as readonly unknown[]).includes(w.kind) && !!w.text && w.text.length <= ANSWER_KEY_LIMITS.textMax)
    .slice(0, ANSWER_KEY_LIMITS.wrongMax);
  if (correct.length < ANSWER_KEY_LIMITS.correctMin || wrong.length < ANSWER_KEY_LIMITS.wrongMin) return null;
  return { correct, wrong };
}

/**
 * J1: a blokkolásra jogosult hibás esetek — kimarad, amely egy teljes pontos helyes válasz minden szavát tartalmazza (ezt semmilyen
 * szócsoport-rubrika nem utasíthatja el). Közös predikátum: az `answerKeyProblems` és a gépi kalibráció őre (S3c, review #338) is ezt használja.
 */
export function blockingWrongCases(task: OpenTask, cases: AnswerKeyCases): AnswerKeyCases["wrong"] {
  const fullCorrect = cases.correct.filter((answer) => evaluateOpenAnswer(answer, task).state === "ok");
  // S5a: a kifejezéscsoport (sorrend) a próbát megkülönböztetheti — a J1-kivétel csak akkor áll, ha a próba a kifejezéseket is teljesíti.
  return cases.wrong.filter((wrong) => !(fullCorrect.some((answer) => answerTokensCover(wrong.text, answer)) && !missingPhrases(wrong.text, task).length));
}

/**
 * A tesztek ítélete: minden helyes eset teljes pontot kap, és egyik hibás sem. Az üzenet a bank meglévő `"<id>: …"` alakját követi,
 * így a javítókör és a kivétel (salvage) változatlanul kezeli. A számolós (`typedAnswers`) feladat kimarad (T5).
 */
export function answerKeyProblems(task: OpenTask, cases: AnswerKeyCases | null): string[] {
  if (!cases || isComputedTask(task)) return [];
  const problems: string[] = [];
  for (const answer of cases.correct) {
    const score = evaluateOpenAnswer(answer, task);
    if (score.state !== "ok") {
      const phrases = missingPhrases(answer, task);
      problems.push(`${task.id}: válaszkulcs-teszt: a helyes válasz ${quote(answer)} nem kap teljes pontot (${score.reason}; a rubrika fel nem ismert csoportjai: ${JSON.stringify(missingAnswerConcepts(answer, task))}${phrases.length ? `; hiányzó kifejezések (requiredPhrases): ${JSON.stringify(phrases)}` : ""}). Bővítsd a rubrikát a helyes megfogalmazásokkal, vagy tedd a kérdést egyértelművé.`);
    }
  }
  // J1: a pontozóval elvben megkülönböztethetetlen hibás próba (egy teljes pontos helyes válasz minden szavát tartalmazza) nem blokkol —
  // ezt semmilyen szócsoport-rubrika nem utasíthatja el; `answerKeyNotes` jelenti tájékoztatásként.
  for (const wrong of blockingWrongCases(task, cases)) {
    if (evaluateOpenAnswer(wrong.text, task).state === "ok") {
      problems.push(`${task.id}: válaszkulcs-teszt: a hibás (${KIND_HU[wrong.kind]}) válasz ${quote(wrong.text)} teljes pontot kap — a rubrika túl megengedő; tegyél kötelező csoportba olyan elemet, amely a helyes választ megkülönbözteti (ha a különbség a nyelvtani alak vagy a szórend, a helyes alakot requiredPhrases-be: egymás utáni, pontos kifejezés).`);
    }
  }
  return problems;
}

/**
 * J1: a szócsoport-pontozóval elvben megkülönböztethetetlen hibás próbák (tájékoztatás, nem blokkoló): a hibás válasz egy teljes pontos
 * helyes válasz minden szavát tartalmazza (pl. felcserélt viszony ugyanazokkal a szavakkal).
 */
export function answerKeyNotes(task: OpenTask, cases: AnswerKeyCases | null): string[] {
  if (!cases || isComputedTask(task)) return [];
  const fullCorrect = cases.correct.filter((answer) => evaluateOpenAnswer(answer, task).state === "ok");
  return cases.wrong.filter((wrong) => evaluateOpenAnswer(wrong.text, task).state === "ok" && fullCorrect.some((answer) => answerTokensCover(wrong.text, answer)) && !missingPhrases(wrong.text, task).length)
    .map((wrong) => `${task.id}: a(z) ${KIND_HU[wrong.kind]} próba ${quote(wrong.text)} a helyes válasz minden szavát tartalmazza — a szócsoport-pontozó elvben sem különböztetheti meg (nem blokkoló).`);
}
