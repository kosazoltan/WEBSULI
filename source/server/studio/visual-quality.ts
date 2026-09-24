import type { Lesson } from "../../shared/lesson-schema";
import { visualParamProblems } from "../../shared/lesson-visual-params";

/**
 * Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md, 4. szelet): gyenge ábrák gépi felismerése.
 *
 * Mért osztályok (a tulajdonos „primitív, semmit érő ábrák” jelzése mögött):
 *  - `echo`: process-ábra, amelynek lépései egy ugyanabban a fejezetben lévő példa lépései (szövegdoboz,
 *    nem ábra) — a 2026-09-24-es élő futásokban minden ábra ilyen volt;
 *  - `outline`: geometry — egyetlen címke nélküli körvonal (a holdciklusnál „egy kör”);
 *  - `broken`: a rajzoló a hiányos paraméterből nem rajzol semmit.
 * A mérés nem blokkol: az ábrakészítő egy célzott újrakérést kap rájuk, a maradék jelzésként marad.
 */

export type WeakVisual = { sectionIndex: number; blockIndex: number; kind: "echo" | "outline" | "broken"; reason: string };

const norm = (s: string) => s.toLocaleLowerCase("hu").replace(/[\s.,;:!?·×*()–—-]+/g, " ").trim();

export function weakVisuals(lesson: Lesson): WeakVisual[] {
  const weak: WeakVisual[] = [];
  lesson.sections.forEach((section, sectionIndex) => {
    const exampleSteps = new Set(section.blocks.flatMap((b) => (b.kind === "example" ? b.steps.map(norm) : [])));
    section.blocks.forEach((block, blockIndex) => {
      if (block.kind !== "animate") return;
      const at = { sectionIndex, blockIndex };
      if (block.animKind === "geometry") {
        weak.push({ ...at, kind: "outline", reason: "puszta körvonal (geometry) — címkézett alakzat (labeledShape) vagy körforgás (cycle) mutatná a lényeget" });
        return;
      }
      const problems = visualParamProblems(block.animKind, block.params);
      if (problems.length) { weak.push({ ...at, kind: "broken", reason: `hiányos adat, nem rajzolódik ki: ${problems.join("; ").slice(0, 200)}` }); return; }
      if (block.animKind === "process" && exampleSteps.size) {
        const steps = Array.isArray(block.params.steps) ? (block.params.steps as unknown[]).filter((s): s is string => typeof s === "string").map(norm) : [];
        const copied = steps.filter((s) => exampleSteps.has(s)).length;
        if (steps.length && copied / steps.length >= 0.5) {
          weak.push({ ...at, kind: "echo", reason: `a példa lépéseit ismétli szövegdobozban (${copied}/${steps.length} lépés) — nem mutat semmit, amit a szöveg ne mondana el` });
        }
      }
    });
  });
  return weak;
}

/** Az ábrakészítő célzott újrakéréséhez: melyik blokkot és miért cserélje. */
export function weakVisualsInstruction(weak: WeakVisual[], rejected: string[] = []): string {
  return [
    ...(weak.length ? [
      "Az alábbi ábrák gyengék. Mindegyiket CSERÉLD (\"replace\": a blokk i-je) a fogalmat valóban megmutató ábrára, ugyanebben a folt-alakban; ha a fejezetben nincs rajzolható tartalom, hagyd ki a fejezetet.",
      ...weak.map((w) => `- ${w.sectionIndex}. fejezet (index), ${w.blockIndex}. blokk (i): ${w.reason}`),
    ] : []),
    // Spec 2026-09-24 (2. szelet): az elutasított ábra (pl. illusztráció kicsi betűvel) okkal visszamegy.
    ...(rejected.length ? [
      "Az alábbi ábrákat a program ELUTASÍTOTTA; a megadott okot javítva add újra őket (\"after\"), a fenti blokkszámokkal:",
      ...rejected.map((r) => `- ${r}`),
    ] : []),
  ].join("\n");
}
