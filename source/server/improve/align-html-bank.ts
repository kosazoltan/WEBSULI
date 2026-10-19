import { readRawHtmlLessonData, writeHtmlLessonData } from "../../shared/lesson-html-data";
import { alignTaskToSample } from "../studio/bank-normalize";
import type { LessonExperience } from "../../shared/lesson-experience";

type Task = LessonExperience["tasks"][number];

/**
 * Spec 2026-10-19-okositas-bank-igazitas: a HTML-okosítás JSON-bankjának nyílt feladatait a záró kapu ELŐTT a saját mintájukhoz
 * igazítjuk — ugyanaz a determinisztikus lépés, amit a Stúdió-ág a `normalizeBankPacket`-ben futtat. Mért (1e169ace, a0d16870):
 * egyetlen ragozott / mondatjelző nélküli minta 45+ feladatból elbuktatta a teljes futást. A pontozó és a küszöbök változatlanok;
 * a HTML a JSON-bankon kívül bájtra azonos marad, olvashatatlan banknál semmi nem változik (a kapu jelenti).
 */
export function alignHtmlLessonBank(html: string): { html: string; aligned: string[] } {
  let data: unknown;
  try { data = readRawHtmlLessonData(html); } catch { return { html, aligned: [] }; }
  const tasks = (data as { experience?: { tasks?: unknown } } | null)?.experience?.tasks;
  if (!Array.isArray(tasks)) return { html, aligned: [] };
  const aligned: string[] = [];
  for (const raw of tasks) {
    const t = raw as Partial<Task> | null;
    if (!t || typeof t.sample !== "string" || typeof t.minWords !== "number" || !Array.isArray(t.required)
      || !t.required.every((g) => Array.isArray(g) && g.every((w) => typeof w === "string"))) continue;
    const before = JSON.stringify(t);
    alignTaskToSample(t as Task);
    if (JSON.stringify(t) !== before) aligned.push(String(t.id ?? "?"));
  }
  if (aligned.length === 0) return { html, aligned };
  try { return { html: writeHtmlLessonData(html, data), aligned }; } catch { return { html, aligned: [] }; }
}
