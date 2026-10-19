import { readRawHtmlLessonData, writeHtmlLessonData } from "../../shared/lesson-html-data";
import { alignTaskToSample } from "../studio/bank-normalize";
import { openTaskSchema, type LessonExperience } from "../../shared/lesson-experience";

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
    // Review #327: csak a sémának megfelelő feladat igazítható; az alakhibásat (pl. hiányos `requiredDistinct`) a kapu jelenti, és a
    // pontozó kivétele sem kerülheti meg a sémakaput és a hibalistás újrapróbát.
    if (!openTaskSchema.safeParse(raw).success) continue;
    const t = raw as Task;
    const before = JSON.stringify(t);
    try { alignTaskToSample(t); } catch { Object.assign(t, JSON.parse(before)); continue; }
    if (JSON.stringify(t) !== before) aligned.push(String(t.id ?? "?"));
  }
  if (aligned.length === 0) return { html, aligned };
  try { return { html: writeHtmlLessonData(html, data), aligned }; } catch { return { html, aligned: [] }; }
}
