import type { AgeBand, Block } from "./lesson-schema";
import { BAND_THEME } from "./lesson-band";
import { OPENER_STAGES, OPENING_FORM_LABEL } from "./lesson-opener";

/**
 * Spec 2026-11-08-borito-blokkcimkek: a blokk fejléce a TARTALOMBÓL — Célkártya, mese, a magyarázat mélysége, az ábra és a feladat fajtája.
 * Tiszta függvény (a lejátszó és a teszt közös).
 */
const STAGES = Object.values(OPENER_STAGES);
const GOAL_LABELS = [...new Set(STAGES.map((s) => s.goalLabels[0]))];
const OTHER_LABELS = [...new Set(STAGES.flatMap((s) => s.goalLabels.slice(1)))];

/** A bekezdés a címkével kezdődik-e (jelölés nélkül), és utána nem betű folytatja (Unicode-biztos: a „Célszerű” nem „Cél”). */
function startsWithLabel(paragraph: string, labels: readonly string[], boldOnly = false): boolean {
  if (boldOnly && !/^\s*(?:\*\*|__)/.test(paragraph)) return false;
  const p = paragraph.replace(/^\s*(?:\*\*|__)?\s*/, "");
  return labels.some((l) => p.startsWith(l) && !/^\p{L}/u.test(p.slice(l.length)));
}

/**
 * Review #405: a Célkártya a lépcső saját címkéivel írt négy rövid bekezdés — az első a célcímkével, és legalább két további a buktató /
 * ok / leküzdés címkéjével kezdődik. Sima „Célunk az …” mondat vagy „Cél…” kezdetű többbekezdéses magyarázat nem az.
 */
export function isGoalCardText(text: string): boolean {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (!paragraphs.length) return false;
  const rest = paragraphs.slice(1);
  if (startsWithLabel(paragraphs[0], GOAL_LABELS)) return rest.filter((p) => startsWithLabel(p, OTHER_LABELS)).length >= 2;
  // Spec 2026-11-10-gyartas-meres (J2): a modell néha elhagyja a célcímkét. Címke nélküli első bekezdés csak a Célkártya pontos alakjában
  // számít annak (review #414): négy bekezdés, az első nem buktató / ok / leküzdés címkés, a másik HÁROM mind FÉLKÖVÉREN jelölt ilyen
  // címkével kezdődik. Egy közönséges magyarázat, amelyben két ilyen kiemelt sor is van, nem Célkártya.
  if (startsWithLabel(paragraphs[0], OTHER_LABELS)) return false;
  return rest.length === 3 && rest.every((p) => startsWithLabel(p, OTHER_LABELS, true));
}

export const ANIM_LABELS: Readonly<Record<string, string>> = {
  numberLine: "Számegyenes", fraction: "Törtmodell", timeline: "Idővonal", geometry: "Ábra", process: "Folyamat", map: "Térkép",
  wordBuilder: "Szóépítő", sentenceParts: "Mondatelemzés", triangleArea: "Kísérlet", decisionStory: "Döntéshelyzet", cycle: "Körforgás",
  labeledShape: "Feliratos ábra", barChart: "Diagram", venn: "Halmazábra", illustration: "Illusztráció", scene3d: "3D-modell",
  table: "Táblázat", ruleBox: "Szabály", compareCards: "Hasonlítsd össze!",
};

/**
 * Spec 2026-11-18 (tananyaggyártás minősége, S2a): a forrás-ábrák megjelenítőinek feliratai — KÓDSZÓTÁR, nem modellkimenet. A
 * blokkfejléc korosztályonként; a megjelenítőn belüli feliratok (a tónus neve, „Példa”, a görgetés jelzése) sávfüggetlenek.
 */
export type RuleBoxTone = "rule" | "warning" | "tip";
export const SOURCE_VISUAL_HEAD_LABELS: Readonly<Record<AgeBand, { table: string; compareCards: string; ruleBox: Record<RuleBoxTone, string> }>> = {
  kid: { table: "Táblázat", compareCards: "Hasonlítsd össze!", ruleBox: { rule: "Jegyezd meg!", warning: "Figyelj!", tip: "Tipp" } },
  teen: { table: "Táblázat", compareCards: "Hasonlítsd össze!", ruleBox: { rule: "Szabály", warning: "Figyelj!", tip: "Tipp" } },
  senior: { table: "Táblázat", compareCards: "Összehasonlítás", ruleBox: { rule: "Szabály", warning: "Figyelem", tip: "Tipp" } },
};
export const SOURCE_VISUAL_TEXT = {
  ruleBoxTone: { rule: "Szabály", warning: "Figyelj!", tip: "Tipp" } as Readonly<Record<RuleBoxTone, string>>,
  example: "Példa",
  tableFallbackName: "Táblázat",
  /** Görgő táblánál: érintőképernyőn húzni kell, egérrel / billentyűvel görgetni (a megjelenítő a mutatóeszköz szerint választ). */
  scrollHintTouch: "Húzd oldalra a táblázatot",
  scrollHint: "A táblázat oldalra görgethető",
  /** Elágazás-alapértelmezés a döntési fához (S2b használja). */
  branchYes: "Igen", branchNo: "Nem",
} as const;
const ruleBoxTone = (params: unknown): RuleBoxTone => { const t = (params as { tone?: unknown } | null)?.tone; return t === "warning" || t === "tip" ? t : "rule"; };

export const TRY_LABELS: Readonly<Record<string, string>> = { dragSort: "Rendezd sorba", fillBlank: "Egészítsd ki", match: "Párosítsd" };

/** Spec 2026-11-08-tartalmi-fejlecek-2: az ellenőrző kérdés IQ-formája a kérdés szövegéből (az első egyező). */
export const CHECK_FORMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/igaz vagy hamis/i, "Igaz vagy hamis?"],
  [/kakukktojás|nem illik (?:közé|a sorba)/i, "Kakukktojás"],
  [/találós/i, "Találós kérdés"],
  [/analógia|úgy aránylik|úgy viszonyul/i, "Analógia"],
  // Review #406: Unicode-biztos szóhatárok (a JS `\b` az ékezetnél is határt lát: „Néha” ≠ „ha”); „elemek közül” ≠ „következő elem”.
  [/sorminta|következő (?:elem|szám|tag)(?!\p{L})/iu, "Sorminta"],
  [/melyik (?:állítás )?hamis/i, "Melyik hamis?"],
  [/(?:^|[^\p{L}])ha(?!\p{L})[^.?!]*[^\p{L}.?!]akkor(?!\p{L})/iu, "Következtetés"],
];

export function checkFormLabel(question: string): string | null {
  return CHECK_FORMS.find(([re]) => re.test(question))?.[1] ?? null;
}

/** `openingForm` (S5b, docs/specs/2026-11-20-tgm-valtozatossag-abrak.md 11. szakasz): a jelölt lecke kiosztott nyitásformája. */
export function blockLabel(blocks: readonly Block[], index: number, sectionIdx: number, band: AgeBand, classroom?: number, isLastSection?: boolean, openingForm?: string): string {
  const block = blocks[index];
  const theme = BAND_THEME[band];
  switch (block.kind) {
    case "explain": {
      if (sectionIdx === 0 && index === 0 && isGoalCardText(block.text)) return "A lecke célja";
      const prev = blocks[index - 1];
      if (sectionIdx === 0 && index === 1 && prev?.kind === "explain" && isGoalCardText(prev.text)) {
        // S5b: a kiosztott forma címkéje (kódszótár); ismeretlen vagy hiányzó formánál a régi szabály.
        if (openingForm && Object.prototype.hasOwnProperty.call(OPENING_FORM_LABEL, openingForm)) return OPENING_FORM_LABEL[openingForm];
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
    case "animate": {
      const own = SOURCE_VISUAL_HEAD_LABELS[band];
      if (block.animKind === "ruleBox") return own.ruleBox[ruleBoxTone(block.params)];
      if (block.animKind === "table" || block.animKind === "compareCards") return own[block.animKind];
      return ANIM_LABELS[block.animKind] ?? "Ábra";
    }
    case "try": return TRY_LABELS[block.tryKind] ?? "Próbáld ki";
  }
}
