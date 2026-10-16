/**
 * Tételgyár T2.1 (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md): a válaszkulcs-tesztek írója. A kérés a rubrikát
 * NEM tartalmazza — csak a kérdést, a mintaválaszt, a fogalmak definícióját és az évfolyamot. Hibánál nincs ítélet (a csomag a T2 előtti
 * szabályok szerint épül). docs/specs/2026-10-16-egy-futas.md (S4b): a hívás az egyfutásos beszélgetésben megy (nincs külön tesztíró-modell).
 */
import { createHash } from "node:crypto";
import { sanitizeAnswerKeyCases, ANSWER_KEY_LIMITS, type AnswerKeyCases } from "../../shared/answer-key-tests";
import type { OpenTask } from "../../shared/lesson-experience";
import { isTypedTask } from "../../shared/lesson-experience-score";
import { WorkflowConflict, WorkflowWaiting } from "../workflows/engine";

export type AnswerKeyCaller = (system: string, user: string) => Promise<unknown>;
export type AnswerKeyContext = { classroom?: number; concepts: Array<{ id: string; term?: string; definition?: string }> };

export const ANSWER_KEY_SYSTEM = [
  "Te egy tapasztalt magyar tanító vagy, aki egy nyílt feladat pontozójához TESZTVÁLASZOKAT ír.",
  "Minden feladathoz írj:",
  `- ${ANSWER_KEY_LIMITS.correctMin + 1}–${ANSWER_KEY_LIMITS.correctMax} HELYES választ, ahogy különböző gyerekek valóban leírnák: eltérő szórenddel, ragozással,`,
  "  rokon értelmű szavakkal, rövidebben és hosszabban — de mindegyik tartalmilag teljes és helyes (minden, amit a kérdés kér, benne van).",
  `- ${ANSWER_KEY_LIMITS.wrongMin + 1}–${ANSWER_KEY_LIMITS.wrongMax} HIBÁS választ, mindegyiknél a fajtájával: "tevhit" (jellegzetes tévhit), "forditott" (fordított irány /`,
  "  felcserélt ok-okozat), \"hianyos\" (csak a válasz egy része), \"temaidegen\" (a témához tartozó, de a kérdésre nem felelő állítás).",
  "A mintaválasz csak tájékoztat: a helyes válaszok NE legyenek a minta szó szerinti másolatai.",
  `Egy válasz legfeljebb ${ANSWER_KEY_LIMITS.textMax} karakter. Csak a tanított fogalmakra támaszkodj; ne találj ki új tényt.`,
  'Válaszolj kizárólag ilyen JSON-nal: { "items": [ { "id": "<feladat id>", "correct": ["…"], "wrong": [ { "kind": "tevhit", "text": "…" } ] } ] }',
].join("\n");

/** A feladat tartalmi kulcsa: ha a kérdés, a minta és a szóminimum nem változott, a tesztek újrahasznosíthatók (javítókör). */
export const answerKeyCacheKey = (task: Pick<OpenTask, "q" | "sample" | "minWords">) =>
  createHash("sha256").update(JSON.stringify([task.q, task.sample, task.minWords])).digest("hex");

export function answerKeyUserMessage(tasks: OpenTask[], ctx: AnswerKeyContext): string {
  const used = new Set(tasks.flatMap((t) => t.coversConceptIds));
  const concepts = ctx.concepts.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, term: c.term ?? "", definition: (c.definition ?? "").slice(0, 400) }));
  const items = tasks.map((t) => ({ id: t.id, kerdes: t.q, mintavalasz: t.sample, fogalmak: t.coversConceptIds }));
  return `${ctx.classroom ? `Évfolyam: ${ctx.classroom}. osztály.\n` : ""}Fogalmak:\n${JSON.stringify(concepts)}\n\nFeladatok:\n${JSON.stringify(items)}`;
}

/**
 * A csomag nyílt (nem számolós) feladatainak tesztesetei feladat-id szerint. A gyorsítótárban lévő (változatlan) feladat nem kerül a hívásba.
 * Hívási vagy alaki hiba → az érintett feladatok kimaradnak (nincs ítélet), és a `warn` megkapja az okot.
 */
export async function writeAnswerKeys(
  tasks: OpenTask[], ctx: AnswerKeyContext, call: AnswerKeyCaller,
  cache: Map<string, AnswerKeyCases>, warn: (message: string) => void = () => {},
): Promise<Map<string, AnswerKeyCases>> {
  const out = new Map<string, AnswerKeyCases>();
  const open = tasks.filter((t) => !isTypedTask(t));
  const missing = open.filter((t) => {
    const hit = cache.get(answerKeyCacheKey(t));
    if (hit) out.set(t.id, hit);
    return !hit;
  });
  if (!missing.length) return out;
  let raw: unknown;
  try { raw = await call(ANSWER_KEY_SYSTEM, answerKeyUserMessage(missing, ctx)); }
  catch (error) {
    // Az elvesztett lízing / várakozó workflow nem modellhiba — a motorig kell jutnia (mint a témafókusznál, PR #132 review).
    if (error instanceof WorkflowConflict || error instanceof WorkflowWaiting) throw error;
    warn(`a tesztíró hívása hibázott (${error instanceof Error ? error.message.slice(0, 200) : String(error)}) — ${missing.length} feladat teszt nélkül`);
    return out;
  }
  const items = Array.isArray((raw as { items?: unknown } | null)?.items) ? (raw as { items: unknown[] }).items : [];
  const byId = new Map(items.map((i) => [String((i as { id?: unknown })?.id ?? ""), i] as const));
  let skipped = 0;
  for (const task of missing) {
    const cases = sanitizeAnswerKeyCases(byId.get(task.id));
    if (!cases) { skipped++; continue; }
    cache.set(answerKeyCacheKey(task), cases);
    out.set(task.id, cases);
  }
  if (skipped) warn(`${skipped} feladathoz a tesztíró nem adott használható esetkészletet — ezek teszt nélkül`);
  return out;
}

/** Vészfék: `STUDIO_ANSWER_KEY_TESTS=0` kikapcsolja a válaszkulcs-teszteket (alapból bekapcsolva). */
export const answerKeyTestsEnabled = (env: Record<string, string | undefined> = process.env) => env.STUDIO_ANSWER_KEY_TESTS !== "0";

/** A bankgyártás `answerKeys` függősége: 8 feladatos darabokban, egy futáson belüli gyorsítótárral. */
export function answerKeysFor(ctx: AnswerKeyContext, call: AnswerKeyCaller, warn: (message: string) => void) {
  const cache = new Map<string, AnswerKeyCases>();
  return async (tasks: OpenTask[], sectionIndex: number): Promise<Map<string, AnswerKeyCases>> => {
    const out = new Map<string, AnswerKeyCases>();
    for (let i = 0; i < tasks.length; i += 8) {
      const got = await writeAnswerKeys(tasks.slice(i, i + 8), ctx, call, cache, (w) => warn(`${sectionIndex + 1}. fejezet: ${w}`));
      for (const [id, cases] of got) out.set(id, cases);
    }
    return out;
  };
}
