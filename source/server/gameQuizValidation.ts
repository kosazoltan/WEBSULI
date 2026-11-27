import { singleChoiceProblems } from "../shared/single-choice-check";
import { classifyQuizItem } from "../shared/practice-policy";

/** A játék-kvízgenerátor tételének alakja (a `gameQuizGeneratorService.ts` újraexportálja). */
export type GeneratedQuizItem = {
  prompt: string;
  options: string[];
  correctIndex: number;
  topic: "english" | "math" | "nature" | "hungarian";
  /**
   * T-1: a MIÉRT, amit a játék rossz válasznál megmutat.
   *
   * Enélkül a játék csak büntetett (élet, idő, XP), és a téves fogalom
   * érintetlenül maradt a gyerekben — ez a legdrágább hiba egy tanuló-
   * programban.
   */
  explanation: string;
};

const ALLOWED_TOPICS = new Set(["english", "math", "nature", "hungarian"]);

/** Egy generált tétel hibája (TG-P5a: tételes ok a pótló kérésnek és az admin-válasznak), vagy `null`. */
function quizItemProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "nem tétel-objektum";
  const item = raw as Partial<GeneratedQuizItem>;
  if (typeof item.prompt !== "string" || item.prompt.length < 3 || item.prompt.length > 200) return "a kérdés hiányzik vagy 3–200 karakteren kívül esik";
  if (!Array.isArray(item.options) || item.options.length !== 4 ||
    !item.options.every((o): o is string => typeof o === "string" && o.trim().length > 0 && o.length < 60)) return "nem pontosan 4 rövid (1–59 karakteres, nem üres) válaszopció";
  if (typeof item.correctIndex !== "number" || !Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3) return "a correctIndex nem 0–3 közötti egész";
  // T-1: magyarázat nélküli tétel nem kerül a bankba — a néma büntetés pont az, amit meg akarunk szüntetni.
  if (typeof item.explanation !== "string" || item.explanation.trim().length < 5 || item.explanation.length > 300) return "a magyarázat hiányzik vagy túl hosszú";
  if (typeof item.topic !== "string" || !ALLOWED_TOPICS.has(item.topic)) return "ismeretlen topic";
  if (singleChoiceProblems({ prompt: item.prompt, options: item.options, correctIndex: item.correctIndex }).length > 0) return "nem pontosan egy helyes opció";
  // TG-P5a: a feladatlapra / a játékra vonatkozó kérdés (pontozás, feladattípus, szerkezet) nem tanított tudást mér.
  const verdict = classifyQuizItem({ question: item.prompt, options: item.options });
  if (verdict.kind === "meta") return `a feladatlapra vonatkozó meta-kérdés (${verdict.reason}) — a tanított példára kérdezz`;
  return null;
}

/**
 * A modell által generált tételek validálása (kiemelve a DB-t importáló szolgáltatásból, hogy tesztelhető legyen).
 * Spec 2026-09-29 (egy-helyes-valasz): a bizonyíthatóan nem pontosan-egy helyes opciós tétel is eldobódik.
 * TG-P5a: a meta-kérdés is kiesik; minden eldobott tételhez `#<sorszám>: <ok>` (1-től számozva).
 */
export function validateGeneratedQuizItems(raws: unknown[]): { valid: GeneratedQuizItem[]; skipped: number; rejected: string[] } {
  const valid: GeneratedQuizItem[] = [];
  const rejected: string[] = [];
  raws.forEach((raw, i) => {
    const problem = quizItemProblem(raw);
    if (problem) rejected.push(`#${i + 1}: ${problem}`);
    else valid.push(raw as GeneratedQuizItem);
  });
  return { valid, skipped: rejected.length, rejected };
}

const promptKey = (p: string) => p.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();

/**
 * TG-P5a: a kért darabszámú bank összegyűjtése. Az első válasz hiányánál legfeljebb EGY célzott pótlás (csak a hiányzó
 * darabszámra, az elutasítás okaival és a már elfogadott kérdésekkel). Az ismétlődő kérdés kiesik, a többlet levágódik.
 * `complete: false` esetén a hívó NEM cserélheti le az aktív készletet.
 */
export async function collectQuizBank(
  count: number,
  ask: (n: number, note: string) => Promise<unknown[]>,
): Promise<{ items: GeneratedQuizItem[]; complete: boolean; rejected: string[] }> {
  const items: GeneratedQuizItem[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  const take = (raws: unknown[], label: string) => {
    const r = validateGeneratedQuizItems(raws);
    rejected.push(...r.rejected.map((x) => `${label}${x}`));
    for (const item of r.valid) {
      const key = promptKey(item.prompt);
      if (seen.has(key)) { rejected.push(`${label}ismétlődő kérdés: ${item.prompt.slice(0, 80)}`); continue; }
      seen.add(key);
      items.push(item);
    }
  };
  take(await ask(count, ""), "");
  if (items.length < count) {
    const missing = count - items.length;
    const note = [
      `Az előző válaszból ${items.length} tétel megfelelt, ${missing} hiányzik.`,
      rejected.length ? `Elutasítás okai: ${rejected.slice(0, 10).join("; ")}.` : "",
      items.length ? `Ezeket NE ismételd: ${items.map((i) => i.prompt).join(" | ").slice(0, 1500)}` : "",
    ].filter(Boolean).join("\n");
    take(await ask(missing, note), "pótlás ");
  }
  return { items: items.slice(0, count), complete: items.length >= count, rejected };
}
