import type { AgeBand, Block } from "./lesson-schema";
import { BAND_THEME } from "./lesson-band";
import { OPENER_STAGES } from "./lesson-opener";

/**
 * Spec 2026-11-08-borito-blokkcimkek: a blokk fejléce a TARTALOMBÓL — Célkártya, mese, a magyarázat mélysége, az ábra és a feladat fajtája.
 * Tiszta függvény (a lejátszó és a teszt közös).
 */
const STAGES = Object.values(OPENER_STAGES);
const GOAL_LABELS = [...new Set(STAGES.map((s) => s.goalLabels[0]))];
const OTHER_LABELS = [...new Set(STAGES.flatMap((s) => s.goalLabels.slice(1)))];

/** A bekezdés a címkével kezdődik-e (jelölés nélkül), és utána nem betű folytatja (Unicode-biztos: a „Célszerű” nem „Cél”). */
function startsWithLabel(paragraph: string, labels: readonly string[]): boolean {
  const p = paragraph.replace(/^\s*(?:\*\*|__)?\s*/, "");
  return labels.some((l) => p.startsWith(l) && !/^\p{L}/u.test(p.slice(l.length)));
}

/**
 * Review #405: a Célkártya a lépcső saját címkéivel írt négy rövid bekezdés — az első a célcímkével, és legalább két további a buktató /
 * ok / leküzdés címkéjével kezdődik. Sima „Célunk az …” mondat vagy „Cél…” kezdetű többbekezdéses magyarázat nem az.
 */
export function isGoalCardText(text: string): boolean {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (!paragraphs.length || !startsWithLabel(paragraphs[0], GOAL_LABELS)) return false;
  return paragraphs.slice(1).filter((p) => startsWithLabel(p, OTHER_LABELS)).length >= 2;
}

export const ANIM_LABELS: Readonly<Record<string, string>> = {
  numberLine: "Számegyenes", fraction: "Törtmodell", timeline: "Idővonal", geometry: "Ábra", process: "Folyamat", map: "Térkép",
  wordBuilder: "Szóépítő", sentenceParts: "Mondatelemzés", triangleArea: "Kísérlet", decisionStory: "Döntéshelyzet", cycle: "Körforgás",
  labeledShape: "Feliratos ábra", barChart: "Diagram", venn: "Halmazábra", illustration: "Illusztráció", scene3d: "3D-modell",
};

export const TRY_LABELS: Readonly<Record<string, string>> = { dragSort: "Rendezd sorba", fillBlank: "Egészítsd ki", match: "Párosítsd" };

/** Spec 2026-11-08-tartalmi-fejlecek-2: az ellenőrző kérdés IQ-formája a kérdés szövegéből (az első egyező). */
export const CHECK_FORMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/igaz vagy hamis/i, "Igaz vagy hamis?"],
  [/kakukktojás|nem illik (?:közé|a sorba)/i, "Kakukktojás"],
  [/találós/i, "Találós kérdés"],
  [/analógia|úgy aránylik|úgy viszonyul/i, "Analógia"],
  [/sorminta|következő elem/i, "Sorminta"],
  [/melyik (?:állítás )?hamis/i, "Melyik hamis?"],
  [/\bha\b[^.?!]*\bakkor\b/i, "Következtetés"],
];

export function checkFormLabel(question: string): string | null {
  return CHECK_FORMS.find(([re]) => re.test(question))?.[1] ?? null;
}

export function blockLabel(blocks: readonly Block[], index: number, sectionIdx: number, band: AgeBand, classroom?: number, isLastSection?: boolean): string {
  const block = blocks[index];
  const theme = BAND_THEME[band];
  switch (block.kind) {
    case "explain": {
      if (sectionIdx === 0 && index === 0 && isGoalCardText(block.text)) return "A lecke célja";
      const prev = blocks[index - 1];
      if (sectionIdx === 0 && index === 1 && prev?.kind === "explain" && isGoalCardText(prev.text)) {
        // Review #405: „Mese” csak 1–4. évfolyamon; a programozás (0) a kid sávba esik, de 7–8. korcsoport → „Történet”.
        const young = classroom === undefined ? band === "kid" : classroom >= 1 && classroom <= 4;
        return young ? "Mese" : "Történet";
      }
      if (block.depth === "why") return "Miért?";
      if (block.depth === "deeper") return "Mélyebben";
      return theme.labels.explain;
    }
    case "example": return theme.labels.example;
    case "check": return checkFormLabel(block.question) ?? theme.labels.check;
    case "recap": {
      // A lecke utolsó összefoglalója a mese-visszatérés helye: „A lecke tanulsága”.
      const lastRecap = isLastSection && !blocks.slice(index + 1).some((b) => b.kind === "recap");
      return lastRecap ? "A lecke tanulsága" : theme.labels.recap;
    }
    case "animate": return ANIM_LABELS[block.animKind] ?? "Ábra";
    case "try": return TRY_LABELS[block.tryKind] ?? "Próbáld ki";
  }
}
