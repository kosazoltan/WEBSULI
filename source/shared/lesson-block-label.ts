import type { AgeBand, Block } from "./lesson-schema";
import { BAND_THEME } from "./lesson-band";

/**
 * Spec 2026-11-08-borito-blokkcimkek: a blokk fejléce a TARTALOMBÓL — Célkártya, mese, a magyarázat mélysége, az ábra és a feladat fajtája.
 * Tiszta függvény (a lejátszó és a teszt közös).
 */
const GOAL_LEAD = /^\s*(?:\*\*|__)?\s*(?:Mit tanulunk ma\?|Célunk\b|Cél\b)/u;

export function isGoalCardText(text: string): boolean {
  return GOAL_LEAD.test(text);
}

export const ANIM_LABELS: Readonly<Record<string, string>> = {
  numberLine: "Számegyenes", fraction: "Törtmodell", timeline: "Idővonal", geometry: "Ábra", process: "Folyamat", map: "Térkép",
  wordBuilder: "Szóépítő", sentenceParts: "Mondatelemzés", triangleArea: "Kísérlet", decisionStory: "Döntéshelyzet", cycle: "Körforgás",
  labeledShape: "Feliratos ábra", barChart: "Diagram", venn: "Halmazábra", illustration: "Illusztráció", scene3d: "3D-modell",
};

export const TRY_LABELS: Readonly<Record<string, string>> = { dragSort: "Rendezd sorba", fillBlank: "Egészítsd ki", match: "Párosítsd" };

export function blockLabel(blocks: readonly Block[], index: number, sectionIdx: number, band: AgeBand): string {
  const block = blocks[index];
  const theme = BAND_THEME[band];
  switch (block.kind) {
    case "explain": {
      if (sectionIdx === 0 && index === 0 && isGoalCardText(block.text)) return "A lecke célja";
      const prev = blocks[index - 1];
      if (sectionIdx === 0 && index === 1 && prev?.kind === "explain" && isGoalCardText(prev.text)) return band === "kid" ? "Mese" : "Történet";
      if (block.depth === "why") return "Miért?";
      if (block.depth === "deeper") return "Mélyebben";
      return theme.labels.explain;
    }
    case "example": return theme.labels.example;
    case "check": return theme.labels.check;
    case "recap": return theme.labels.recap;
    case "animate": return ANIM_LABELS[block.animKind] ?? "Ábra";
    case "try": return TRY_LABELS[block.tryKind] ?? "Próbáld ki";
  }
}
