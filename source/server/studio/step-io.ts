import { z } from "zod";

import type { MapConcept } from "./coverage";
import { SUPPORTING_THRESHOLD } from "./coverage";
import { conceptIdsOf, type Lesson } from "../../shared/lesson-schema";
import { NOTE_KINDS, type RawNote } from "./lektor";

/**
 * LS-2c — schemas, validators and prompt builders for the model-driven steps.
 *
 * The pipeline state machine (pipeline.ts) shipped without the calls it sequences:
 * pedagogue, author and lektor had model ids and no runner. This module is the pure,
 * testable layer of that runner — what the models' JSON must look like, the rules the
 * outline must satisfy before an admin sees it, and the prompts, including the D1
 * wording the owner fixed verbatim.
 */

const id = () => z.string().trim().min(1).max(64);

export const outlineSectionSchema = z.object({
  heading: z.string().trim().min(1).max(255),
  /** Every core + ≥90% supporting concept id must appear across sections. */
  conceptIds: z.array(id()).min(1),
  plannedBlocks: z
    .array(z.enum(["explain", "example", "check", "recap", "animate", "try"]))
    .min(1),
  animationSuggestions: z.array(z.string().trim().min(1).max(120)).default([]),
});

export type OutlineSection = z.infer<typeof outlineSectionSchema>;

export const outlineSchema = z.object({
  sections: z.array(outlineSectionSchema).min(1),
  misconceptions: z
    .array(z.object({ conceptId: id(), text: z.string().trim().min(1).max(1000) }))
    .default([]),
});

export type LessonOutline = z.infer<typeof outlineSchema>;

export const lektorReportSchema = z.object({
  notes: z
    .array(
      z.object({
        kind: z.enum(NOTE_KINDS),
        subkind: z.string().trim().min(1).max(32).optional(),
        message: z.string().trim().min(1).max(2000),
        blockPath: z.string().trim().min(1).max(32).optional(),
      }),
    )
    .default([]),
});

export type LektorReport = z.infer<typeof lektorReportSchema>;

export type OutlineCoverage = {
  ok: boolean;
  missingCore: string[];
  unknownIds: string[];
  supporting: { total: number; covered: number; ratio: number };
};

/**
 * The pedagogue's output must cover the curated map before an admin ever reviews it
 * (master plan §6.2): every `core` concept, and at least 90% of `supporting`. A
 * concept id that is not in the map at all is rejected too — an invented binding is
 * how an unreviewed claim slips past D1 while looking well-formed.
 */
export function outlineCoversMap(
  sections: OutlineSection[],
  concepts: MapConcept[],
): OutlineCoverage {
  const known = new Set(concepts.map((c) => c.localId));
  const used = new Set(sections.flatMap((s) => s.conceptIds));

  const core = concepts.filter((c) => c.examWeight === "core").map((c) => c.localId);
  const supporting = concepts.filter((c) => c.examWeight === "supporting").map((c) => c.localId);

  const missingCore = core.filter((c) => !used.has(c));
  const unknownIds = [...used].filter((c) => !known.has(c));
  const coveredSupporting = supporting.filter((c) => used.has(c)).length;
  const supportingRatio = supporting.length === 0 ? 1 : coveredSupporting / supporting.length;

  return {
    ok: missingCore.length === 0 && unknownIds.length === 0 && supportingRatio >= SUPPORTING_THRESHOLD,
    missingCore,
    unknownIds,
    supporting: { total: supporting.length, covered: coveredSupporting, ratio: supportingRatio },
  };
}

/** Concept ids the lesson claims that the map does not contain. Empty = subset holds. */
export function lessonIdsSubsetOfMap(lesson: Lesson, concepts: MapConcept[]): string[] {
  const known = new Set(concepts.map((c) => c.localId));
  return conceptIdsOf(lesson).filter((c) => !known.has(c));
}

/**
 * The percentages the OutlineReview coverage bar shows.
 *
 * Derived from an existing `OutlineCoverage` plus the map: `core` is how many core
 * concepts the sections cover, `supporting` the server-computed ratio, `unknown` the
 * count of invented ids. A map with no core concepts shows core 100% (a 0/0 is a bar
 * at zero for a map that cannot fail on core — misleading in the other direction).
 */
export function coveragePercentages(
  coverage: OutlineCoverage,
  concepts: MapConcept[],
): { core: number; supporting: number; unknown: number } {
  const coreTotal = concepts.filter((c) => c.examWeight === "core").length;
  const coreCovered = coreTotal - coverage.missingCore.length;
  const corePct = coreTotal === 0 ? 100 : Math.round((coreCovered / coreTotal) * 100);

  return {
    core: corePct,
    supporting: Math.round(coverage.supporting.ratio * 100),
    unknown: coverage.unknownIds.length,
  };
}

/**
 * D1, verbatim — the owner's exact words, which the lektor prompt must carry and the
 * author prompt must honour. Changed spelling would weaken the instruction; tests pin
 * this constant.
 */
export const D1_RULE_TEXT =
  "A forrás a mérce. Ha a forrás szerinted téved, azt csak `book_probably_wrong` " +
  "jegyzetként jelezd; a leckében a forrás állítása marad.";

type PromptMap = {
  title?: string;
  subject: string;
  classroom: number;
  concepts: MapConcept[];
};

function mapJson(map: PromptMap): string {
  return JSON.stringify(map, null, 2);
}

/** Pedagógus: vázlat a kurált térképből. A teljes térkép bemegy — szó szerint. */
export function buildPedagoguePrompt(map: PromptMap): string {
  return [
    "Te vagy a pedagógus. A kurált fogalomtérképből készíts lecke-vázlatot.",
    "",
    "Követelmények:",
    "- Minden `core` fogalom és legalább 90%-a a `supporting` fogalmaknak szerepeljen a vázlat valamelyik szakaszában (conceptIds).",
    "- Csak a térképen lévő fogalom-azonosítókat használd; újat ne találj ki.",
    "- Minden szakaszhoz tervezz blokkokat (plannedBlocks) a megengedett típusokból: explain, example, check, recap, animate, try.",
    "- Ahol animáció segítene, írd be az animationSuggestions mezőbe.",
    "",
    `Tanuló: ${map.classroom}. osztály, tantárgy: ${map.subject}.`,
    "",
    "A válasz CSAK JSON legyen, a következő alakban:",
    '{ "sections": [{ "heading": string, "conceptIds": string[], "plannedBlocks": string[], "animationSuggestions": string[] }], "misconceptions": [{ "conceptId": string, "text": string }] }',
    "",
    "Fogalomtérkép:",
    mapJson(map),
  ].join("\n");
}

/**
 * Szerző: a vázlatból teljes lecke.
 *
 * A jegyzetek közül CSAK a blokkolók mennek a szerzőnek, és azok közül sem mindegyik:
 * a `book_probably_wrong` az adminnak szól, kiszűrjük — a szerző soha nem kaphat olyan
 * üzenetet, ami arra bíztatná, hogy a forrás rovására „javítson" (D1).
 */
export function buildAuthorPrompt(
  sections: OutlineSection[],
  map: PromptMap,
  blockerNotes: RawNote[],
): string {
  const authorNotes = blockerNotes.filter((n) => n.subkind !== "book_probably_wrong");
  const conceptIds = [...new Set(sections.flatMap((s) => s.conceptIds))];

  const parts = [
    "You are the lesson author. Write a complete lesson from the outline, in Hungarian, in a register matching the pupil's age band.",
    "",
    D1_RULE_TEXT,
    "",
    "Hard rules:",
    "- Every block's coversConceptIds may use ONLY the ids below — never invent new ones:",
    conceptIds.join(", "),
    "- sourceOnly must be true.",
    "- Every check block needs feedbackPerOption with exactly as many entries as options.",
    "",
  ];

  if (authorNotes.length > 0) {
    parts.push(
      "The lektor asked these fixes after the previous round (change ONLY these, nothing else):",
      ...authorNotes.map((n) => `- [${n.kind}${n.subkind ? "/" + n.subkind : ""}] ${n.message}`),
      "",
    );
  }

  parts.push(
    "A válasz CSAK JSON legyen, a Lesson sémának megfelelően:",
    '{ "title": string, "subject": string, "classroom": number, "mapId": string, "sections": [{ "heading": string, "probaEnabled": true, "blocks": [...] }], "misconceptions": [], "sourceOnly": true }',
    "",
    "Vázlat:",
    JSON.stringify(sections, null, 2),
    "",
    "Fogalomtérkép:",
    mapJson(map),
  );

  return parts.join("\n");
}

/**
 * Lektor: a kész leckét a kurált térképhez méri, és CSAK jelent — sosem ír át.
 *
 * A D1 szabály szó szerint szerepel, mert a lektor a forrás-hűség független ellenőre.
 * Ha a forrás téved, azt `book_probably_wrong` jegyzetként jelezheti (az adminnak);
 * a leckét ő sem „javítja" soha.
 */
export function buildLektorPrompt(lesson: Lesson, map: PromptMap): string {
  return [
    "You are the Lektor. Re-read the lesson against the curated concept map and report problems. You NEVER rewrite the lesson.",
    "",
    D1_RULE_TEXT,
    "",
    `Tanuló: ${map.classroom}. osztály, tantárgy: ${map.subject}.`,
    "",
    "Hard rules:",
    "- Every block's coversConceptIds must exist in the map below. An id that is not in the map is a source_conflict/not_in_map blocker.",
    "- A core concept no block teaches is a coverage_gap/core blocker; a missing supporting concept is a coverage_gap warn.",
    "- Register, style and age-band problems are language / age warnings.",
    "- sourceOnly must be true.",
    "- Report with JSON ONLY: { \"notes\": [{ \"kind\": \"source_conflict|coverage_gap|language|age\", \"subkind\": string?, \"message\": string, \"blockPath\": \"section.block\"? }] }",
    "",
    "Lesson:",
    JSON.stringify(lesson, null, 2),
    "",
    "Concept map:",
    mapJson(map),
  ].join("\n");
}

/**
 * Animátor: a kész leckébe `animate` blokkokat illeszt a vázlat javaslatai szerint.
 *
 * A szerződés szigorú, mert ez fizetett modellhívás, és ez a lecke utolsó gépi
 * módosítása a lektor előtt: CSAK `animate` blokkokat adhat hozzá vagy cserélhet,
 * minden más bájtra azonos marad, új fogalom-azonosító nem születhet (D1). A
 * szabály gépi ellenőrzése: checkAnimatorResult.
 */
export function buildAnimatorPrompt(lesson: Lesson, map: PromptMap): string {
  return [
    "You are the Animator. Add animated visualisations to an already-written lesson.",
    "",
    D1_RULE_TEXT,
    "",
    "Hard rules:",
    "- You may ONLY add new `animate` blocks or replace existing `animate` blocks. Nothing else.",
    "- Every non-animate block must remain verbatim — character for character, byte-identical.",
    "- Every coversConceptIds must come from the ids already used by the lesson — never invent new ones.",
    "- The title, subject, classroom, mapId and sourceOnly must stay exactly as they are.",
    "- Choose animKind from: numberLine, fraction, timeline, geometry, process, map, wordBuilder, sentenceParts; give a params object the runtime can draw and a short Hungarian caption.",
    "",
    "Answer with JSON ONLY — the COMPLETE modified Lesson, matching the Lesson schema:",
    '{ "title": string, "subject": string, "classroom": number, "mapId": string, "sections": [{ "heading": string, "probaEnabled": true, "blocks": [...] }], "misconceptions": [], "sourceOnly": true }',
    "",
    "Lesson:",
    JSON.stringify(lesson, null, 2),
    "",
    "Concept map:",
    mapJson(map),
  ].join("\n");
}

export type AnimatorCheck = {
  ok: boolean;
  reasons: string[];
};

/**
 * The animator's output must be the same lesson plus animations — nothing else.
 *
 * Three machine-checkable invariants: identity fields untouched, no invented
 * concept id (D1), and the sequence of non-animate blocks byte-identical in
 * every section. `animate` blocks are the ONLY place the candidate may differ.
 */
export function checkAnimatorResult(original: Lesson, candidate: Lesson): AnimatorCheck {
  const reasons: string[] = [];

  const identityFields = ["title", "subject", "classroom", "mapId", "sourceOnly"] as const;
  for (const field of identityFields) {
    if (JSON.stringify(original[field]) !== JSON.stringify(candidate[field])) {
      reasons.push(`A lecke azonosító mezője megváltozott: ${field}.`);
    }
  }

  const originalIds = new Set(conceptIdsOf(original));
  for (const id of conceptIdsOf(candidate)) {
    if (!originalIds.has(id)) {
      reasons.push(`Új fogalom-azonosító jelent meg: ${id}.`);
    }
  }

  if (original.sections.length !== candidate.sections.length) {
    reasons.push(
      `A szakaszok száma megváltozott (${original.sections.length} -> ${candidate.sections.length}).`,
    );
  } else {
    original.sections.forEach((section, index) => {
      const originalNonAnimate = section.blocks.filter((b) => b.kind !== "animate");
      const candidateNonAnimate =
        candidate.sections[index]?.blocks.filter((b) => b.kind !== "animate") ?? [];
      if (JSON.stringify(originalNonAnimate) !== JSON.stringify(candidateNonAnimate)) {
        reasons.push(`A(z) ${index + 1}. szakasz nem-animate blokkjai megváltoztak.`);
      }
    });
  }

  return { ok: reasons.length === 0, reasons };
}
