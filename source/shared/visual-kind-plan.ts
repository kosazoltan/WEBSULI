/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (14. szakasz; alap: TGM-terv S6c): ábrafajta-terv. Tantárgyi ajánlás az
 * ábrakészítőnek (csak a promptban hirdetett fajtákból) és a fajta-arány jelzése (nem kapu). Tiszta modul.
 */
import type { CatalogSubject } from "./catalog-taxonomy";
import { subjectKeyOf } from "./subject-key";

export const SUBJECT_KIND_HINTS: Record<CatalogSubject, readonly string[]> = {
  matematika: ["fraction", "numberLine", "labeledShape", "barChart", "venn"],
  "magyar-nyelvtan": ["sentenceParts", "wordBuilder", "venn"],
  "magyar-irodalom": ["timeline", "decisionStory", "illustration"],
  tortenelem: ["timeline", "map", "process"],
  "tarsadalmi-ismeretek": ["process", "venn", "barChart"],
  kornyezetismeret: ["cycle", "illustration", "map"],
  termeszetismeret: ["cycle", "labeledShape", "illustration"],
  biologia: ["labeledShape", "cycle", "illustration"],
  kemia: ["process", "barChart", "labeledShape"],
  fizika: ["process", "barChart", "numberLine", "scene3d"],
  foldrajz: ["map", "cycle", "barChart"],
  angol: ["wordBuilder", "sentenceParts", "timeline"],
  nemet: ["wordBuilder", "sentenceParts", "timeline"],
  francia: ["wordBuilder", "sentenceParts", "timeline"],
  informatika: ["process", "decisionStory", "venn"],
  "enek-zene": ["timeline", "barChart", "illustration"],
  "hit-es-erkolcstan": ["decisionStory", "timeline", "venn"],
  "vizualis-kultura": ["illustration", "labeledShape", "scene3d"],
  technika: ["process", "scene3d", "labeledShape"],
};

/**
 * A paraméterleírásokban LEÍRT ábrafajták: a fajta neve önállóan áll, utána „ — ” vagy „ params:” (pl. „cycle — …”, „decisionStory
 * params: …”). Az ábrakészítőnek ténylegesen elküldött leírásokból kell hívni (1. vak kör L2).
 */
export function describedKinds(contract: string, kinds: readonly string[]): string[] {
  return kinds.filter((kind) => new RegExp(`(?<![\\p{L}\\p{N}_])${kind}(?: — | params:)`, "u").test(contract));
}

/**
 * Az ábrakészítő promptjának tantárgyi sora. Csak olyan fajtát ajánl, amelynek paraméter-alakja a kapott szerződésben le van írva (a
 * leíratlan fajtát a modell nem tudná helyesen kitölteni); ismeretlen tantárgynál vagy ajánlható fajta nélkül nincs sor (1. vak kör L1:
 * egyetlen ajánlható fajta is ajánlás).
 */
export function subjectKindHintLine(subject: string, contract: string): string {
  const key = subjectKeyOf(subject);
  if (!key) return "";
  const kinds = describedKinds(contract, SUBJECT_KIND_HINTS[key]);
  if (!kinds.length) return "";
  return `TANTÁRGYI ÁBRA-AJÁNLÁS (${key}): ebben a tantárgyban ezek a fajták mutatják meg legjobban a tartalmat — ${kinds.join(", ")}. Ahol illik, ezekből válassz; ha a leckében legalább öt saját (nem forrásból átvett) ábra van, egy fajta lehetőleg ne tegye ki többet az ábrák 40%-ánál (kevesebb ábránál ez nem cél).`;
}

type LessonLike = { sections: ReadonlyArray<{ blocks: ReadonlyArray<{ kind: string; animKind?: unknown; sourceVisualId?: unknown }> }> };

/** A lecke NEM forráshoz kötött ábráinak fajtánkénti darabszáma (a forráshoz kötött ábra fajtáját a forrás adja). */
export function visualKindCounts(lesson: LessonLike): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const section of lesson.sections) for (const b of section.blocks) {
    if (b.kind !== "animate" || typeof b.animKind !== "string" || b.sourceVisualId) continue;
    counts[b.animKind] = (counts[b.animKind] ?? 0) + 1;
  }
  return counts;
}

/** Jelzés (nem kapu): egy fajta a nem forráshoz kötött ábrák több mint 40%-a, legalább 5 ábránál. */
export function kindShareProblems(lesson: LessonLike): string[] {
  const counts = visualKindCounts(lesson);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < 5) return [];
  return Object.entries(counts)
    .filter(([, n]) => n / total > 0.4)
    .map(([kind, n]) => `A lecke ${total} ábrájából ${n} „${kind}” fajtájú (${Math.round((n / total) * 100)}%) — a változatosság célja legfeljebb 40%.`);
}

/**
 * A fajta-arány minőségi jelzése a megadott (végleges) leckére: a korábbi `visual_kind_share` bejegyzéseket lecseréli vagy törli, a
 * többit megtartja (1. vak kör L6 — a jelzés a publikált leckére szóljon, a lektori csere és a folytatás után is).
 */
export function withKindShareNotes<N extends { reason?: unknown }>(notes: readonly N[], lesson: LessonLike): Array<N | { reason: "visual_kind_share"; note: string; round: number }> {
  const others = notes.filter((n) => n?.reason !== "visual_kind_share");
  return [...others, ...kindShareProblems(lesson).map((note) => ({ reason: "visual_kind_share" as const, note, round: 0 }))];
}
