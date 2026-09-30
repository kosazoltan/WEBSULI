import type { Block, Lesson } from "../../shared/lesson-schema";
import type { MapConcept } from "./coverage";
import { canonicalJson } from "./step-io";
import { applyVisualPatch } from "./visual-patch";
import { weakVisuals } from "./visual-quality";

/**
 * Spec 2026-09-30 (docs/specs/2026-09-30-abratervezo-3d.md): az ábratervező ügynök.
 *
 * Mért gyökérok: az egész leckés ábra-hívás (11 fejezet, 16k kimeneti keret) fejezetenként ~1,4k tokenből rajzolt →
 * 3–8 alakzatos, „primitív” ábrák. Itt minden fejezet külön hívást kap (párhuzamosan, korlátozott számban); a
 * fejezet foltját a program azonnal próbára illeszti (`applyVisualPatch` — minden őr), és elutasítás vagy gyenge ábra
 * esetén EGY célzott újrakérés megy ugyanarra a fejezetre, az okokkal — a már beillesztett ábrás változat friss
 * sorszámaival (a gyenge ábra így `replace`-szel cserélhető). Egy fejezet hibája nem veszti el a többit.
 * Az eredmény a teljes, ábrákkal kiegészített lecke; a futtató a szokott szerződés-ellenőrzéssel veszi át.
 */

export type DesignerUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type DesignerCall = (system: string, user: string, sectionIndex: number, attempt: number) => Promise<{ json: unknown; usage?: DesignerUsage | null }>;
export type DesignerOptions = {
  call: DesignerCall;
  /** A fejezet promptja az adott leckeváltozaton (az újrakérésnél a már beillesztett ábrás változat sorszámaival). */
  systemFor: (sectionIndex: number, lesson: Lesson) => Promise<string> | string;
  concurrency?: number;
  sections?: number[];
  log?: (line: string) => void;
};
export type DesignerResult = {
  lesson: Lesson;
  /** Fejezetek, amelyekbe új vagy cserélt ábra került. */
  designed: number[];
  usage: DesignerUsage;
  rejected: string[];
  failed: number[];
  retried: number[];
};

export const DESIGNER_CONCURRENCY = 4;
const FIRST_USER = "Válaszolj kizárólag a kért JSON-nal.";

/**
 * A fejezet ábrái a válaszból: `{visuals}`, `{sections:[{index, visuals}]}`, vagy (régi szokás szerint) a teljes lecke —
 * ilyenkor a fejezet ÚJ animate blokkjai lesznek ábrák, a megelőző tanító blokk utáni helyükkel.
 */
export function designerVisuals(json: unknown, sectionIndex: number, base?: Lesson["sections"][number]): unknown[] | null {
  if (!json || typeof json !== "object") return null;
  const value = json as { visuals?: unknown; sections?: unknown };
  if (Array.isArray(value.visuals)) return value.visuals;
  if (!Array.isArray(value.sections)) return null;
  const entries = value.sections as Array<{ index?: unknown; visuals?: unknown; blocks?: unknown }>;
  const indexed = entries.find((s) => s?.index === sectionIndex);
  if (indexed && Array.isArray(indexed.visuals)) return indexed.visuals;
  if (entries.length === 1 && Array.isArray(entries[0]?.visuals)) return entries[0].visuals as unknown[];
  const full = entries[sectionIndex] ?? (entries.length === 1 ? entries[0] : undefined);
  if (!base || !full || !Array.isArray(full.blocks)) return null;
  const known = new Set(base.blocks.filter((b) => b.kind === "animate").map((b) => canonicalJson(b)));
  const teachingIndex = base.blocks.map((b, i) => (b.kind === "animate" ? -1 : i)).filter((i) => i >= 0);
  const visuals: unknown[] = [];
  let seen = 0;
  for (const block of full.blocks as Array<Record<string, unknown>>) {
    if (block?.kind !== "animate") { seen++; continue; }
    if (known.has(canonicalJson(block))) continue;
    const { kind: _kind, ...rest } = block;
    visuals.push({ ...rest, after: seen ? teachingIndex[Math.min(seen, teachingIndex.length) - 1] ?? -1 : -1 });
  }
  return visuals;
}

/**
 * A tervezendő fejezetek: ahol nincs ábra, vagy minden ábrája gyenge/hibás. A kész, jó ábrájú fejezet nem kap új
 * hívást (a szerzői javítókör után csak az átírt fejezet ábrája esik ki).
 */
export function sectionsNeedingDesign(lesson: Lesson): number[] {
  const weak = weakVisuals(lesson);
  return lesson.sections.map((section, index) => {
    const figures = section.blocks.map((b, i) => (b.kind === "animate" ? i : -1)).filter((i) => i >= 0);
    const good = figures.filter((i) => !weak.some((w) => w.sectionIndex === index && w.blockIndex === i));
    return good.length ? -1 : index;
  }).filter((i) => i >= 0);
}

type Trial = { lesson: Lesson; accepted: number; problems: string[] };

/** A fejezet foltjának próbája a megadott leckeváltozaton: elfogadott ábrák száma és a (magyar) problémák. */
export function trySectionVisuals(lesson: Lesson, sectionIndex: number, visuals: unknown[], concepts: ReadonlyArray<MapConcept>): Trial {
  const trial = applyVisualPatch(lesson, { sections: [{ index: sectionIndex, visuals }] }, concepts);
  if (!trial) return { lesson, accepted: 0, problems: ["a válasz nem a kért alakú JSON: {\"visuals\":[…]} kell"] };
  const before = new Set<Block>(lesson.sections[sectionIndex].blocks);
  const blocks = trial.lesson.sections[sectionIndex].blocks;
  const weak = weakVisuals(trial.lesson).filter((w) => w.sectionIndex === sectionIndex && !before.has(blocks[w.blockIndex]));
  return {
    lesson: trial.lesson,
    accepted: trial.added + trial.replaced - weak.length,
    problems: [...trial.rejected, ...weak.map((w) => `${sectionIndex}. fejezet (index), ${w.blockIndex}. blokk (i): ${w.reason}`)],
  };
}

function retryUser(problems: string[]): string {
  return [
    "Az előző ábrádat a program nem fogadta el, vagy gyengének mérte (a blokkszámok a fenti, már beillesztett változatra vonatkoznak). A gyenge ábrát \"replace\"-szel cseréld, az elutasítottat javítva add újra:",
    ...problems.map((p) => `- ${p}`),
    FIRST_USER,
  ].join("\n");
}

export async function designLessonVisuals(lesson: Lesson, concepts: ReadonlyArray<MapConcept>, options: DesignerOptions): Promise<DesignerResult> {
  const usage: DesignerUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const add = (u?: DesignerUsage | null) => {
    if (!u) return;
    usage.promptTokens += u.promptTokens; usage.completionTokens += u.completionTokens; usage.totalTokens += u.totalTokens;
  };
  const sections = options.sections ?? lesson.sections.map((_, i) => i);
  const chosen = new Map<number, Lesson["sections"][number]>();
  const rejected: string[] = [];
  const failed: number[] = [];
  const retried: number[] = [];

  const designOne = async (index: number) => {
    const started = Date.now();
    try {
      const first = await options.call(await options.systemFor(index, lesson), FIRST_USER, index, 0);
      add(first.usage);
      const firstVisuals = designerVisuals(first.json, index, lesson.sections[index]);
      let best: Trial = firstVisuals
        ? trySectionVisuals(lesson, index, firstVisuals, concepts)
        : { lesson, accepted: 0, problems: ["a válasz nem a kért alakú JSON: {\"visuals\":[…]} kell"] };
      // Üres lista = a modell szerint nincs rajzolható tartalom: elfogadott döntés, nincs újrakérés.
      if (best.problems.length) {
        retried.push(index);
        try {
          const base = best.lesson;
          const second = await options.call(await options.systemFor(index, base), retryUser(best.problems), index, 1);
          add(second.usage);
          const secondVisuals = designerVisuals(second.json, index, base.sections[index]);
          if (secondVisuals) {
            const trial = trySectionVisuals(base, index, secondVisuals, concepts);
            const total = best.accepted + trial.accepted;
            if (trial.accepted > 0 || trial.problems.length < best.problems.length) best = { lesson: trial.lesson, accepted: total, problems: trial.problems };
          }
        } catch (error) {
          options.log?.(`${index + 1}. fejezet: az újrakérés elmaradt — ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
        }
      }
      const next = best.lesson.sections[index].blocks, prev = lesson.sections[index].blocks;
      if (next.length !== prev.length || next.some((b, k) => b !== prev[k])) chosen.set(index, best.lesson.sections[index]);
      rejected.push(...best.problems);
      options.log?.(`${index + 1}. fejezet: ${best.accepted} elfogadott ábra, ${Math.round((Date.now() - started) / 1000)} s${best.problems.length ? `; maradt: ${best.problems.join(" | ").slice(0, 300)}` : ""}`);
    } catch (error) {
      failed.push(index);
      options.log?.(`${index + 1}. fejezet: a tervező hívása hibázott — ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
    }
  };

  const queue = [...sections];
  const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency ?? DESIGNER_CONCURRENCY, queue.length)) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await designOne(next);
  });
  await Promise.all(workers);

  const merged: Lesson = { ...lesson, sections: lesson.sections.map((s, i) => chosen.get(i) ?? s) };
  return {
    lesson: merged,
    designed: [...chosen.keys()].sort((a, b) => a - b),
    usage, rejected,
    failed: failed.sort((a, b) => a - b),
    retried: retried.sort((a, b) => a - b),
  };
}
