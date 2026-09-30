import { createHash } from "node:crypto";
import type { Lesson } from "../../shared/lesson-schema";
import type { MapConcept } from "./coverage";
import { withSupportSkill } from "./support-skills";

/**
 * Spec 2026-09-30-tanari-ellenorzolista: a tanári kérés pontjainak mérése a kész leckén.
 *
 * A kérés eddig csak prompt-bemenet volt (a kész leckén semmi nem mérte). Élő eset (Mezopotámia): a kért „Babilon városa
 * Kr. e. 2500 körül” pont csak „szerepel a füzetben” alakban jelent meg. A modell pontonként dönt, de a „tanítja”
 * döntés csak a lecke szövegéből betűhíven kimásolt bizonyítékkal fogadható el (hallucináció-őr).
 */

export const INSTRUCTION_CHECK_MODEL = "claude-opus-5-5";

export type InstructionPoint = { point: string; taught: boolean; evidence: string; section: number | null; sourceQuote?: string };
export type InstructionCheck = { hash: string; points: InstructionPoint[] };

/**
 * A lecke tanítása fejezetenként (cím, explain, példa, összefoglaló) — ebben keressük a „tanítja” bizonyítékát. A modell
 * mellette opcionálisan a forrásszöveget is kapja; a hiányzó pont `sourceQuote`-ját a `parseInstructionCheck` külön, a
 * forrásban ellenőrzi.
 */
export function teachingText(lesson: Lesson): string {
  return lesson.sections.map((section, i) => {
    const parts = section.blocks.flatMap((b) => {
      if (b.kind === "explain") return [b.text];
      if (b.kind === "example") return [b.problem, ...b.steps, b.answer];
      if (b.kind === "recap") return b.bullets;
      return [];
    });
    return `[${i}] ${section.heading}\n${parts.join("\n")}`;
  }).join("\n\n");
}

/** Review #155 (P2): a kulcs a forrást és a mérés sémaverzióját is tartalmazza (a forrás befolyásolja az eredményt). */
export const INSTRUCTION_CHECK_VERSION = "v2-source-quote";
export function instructionCheckHash(instruction: string, lesson: Lesson, sourceText?: string | null): string {
  return createHash("sha256").update(`${INSTRUCTION_CHECK_VERSION}\n${instruction}\n---\n${teachingText(lesson)}\n---\n${sourceText ?? ""}`).digest("hex");
}

export function buildInstructionCheckPrompt(instruction: string, lesson: Lesson, sourceText?: string | null): { system: string; user: string } {
  return {
    system: withSupportSkill("instruction-checker", "Mérd a tanár kérését a lecke tanításához a skill szerint. Kizárólag a kért JSON-t add vissza."),
    user: JSON.stringify({ title: lesson.title, classroom: lesson.classroom, instruction, lesson: teachingText(lesson),
      ...(sourceText?.trim() ? { source: sourceText.slice(0, 60_000) } : {}) }),
  };
}

const norm = (s: string) => s.toLocaleLowerCase("hu").replace(/\*\*/g, "").replace(/[„”"'’]/g, "").replace(/\s+/g, " ").trim();

/** A modell válasza pontokká; a bizonyíték nélküli (vagy nem betűhív) „tanítja” hiánynak számít. */
export function parseInstructionCheck(json: unknown, lesson: Lesson, sourceText?: string | null): InstructionPoint[] {
  const raw = (json as { points?: unknown } | null)?.points;
  if (!Array.isArray(raw)) throw new Error("a tanári kérés mérése nem a kért alakú JSON");
  const haystack = norm(teachingText(lesson));
  const source = sourceText ? norm(sourceText) : "";
  return raw.flatMap((item) => {
    const p = item as { point?: unknown; taught?: unknown; evidence?: unknown; section?: unknown; sourceQuote?: unknown };
    if (typeof p?.point !== "string" || !p.point.trim()) return [];
    const evidence = typeof p.evidence === "string" ? p.evidence.trim() : "";
    // Review #152: a hossz a NORMALIZÁLT bizonyítékon mérve (a „********” normalizálva üres, az includes("") mindig igaz).
    const normalized = norm(evidence);
    const proven = p.taught === true && normalized.replace(/[^\p{L}\p{N}]/gu, "").length >= 8 && haystack.includes(normalized);
    const section = Number.isInteger(p.section) && (p.section as number) >= 0 && (p.section as number) < lesson.sections.length ? p.section as number : null;
    // Spec 2026-09-30-tanari-keres-forrasbol: a hiányzó pont forrás-idézete csak betűhíven (normalizálva) elfogadható.
    // Review #155: a dokumentált 300 karakteres korlát a programban is (ellenőrzés és tárolás ugyanazon a szeleten).
    const quote = typeof p.sourceQuote === "string" ? p.sourceQuote.trim().slice(0, 300) : "";
    const quoted = !proven && source && norm(quote).replace(/[^\p{L}\p{N}]/gu, "").length >= 20 && source.includes(norm(quote));
    return [{ point: p.point.trim().slice(0, 300), taught: proven, evidence: proven ? evidence : "", section, ...(quoted ? { sourceQuote: quote } : {}) }];
  });
}

/**
 * Spec 2026-09-30-tanari-keres-forrasbol (élő mérés: Egyiptom, 22 pontból 5 hiányzott, pedig a forrásban benne volt): a szerző
 * csak a tudástár fogalmaiból tanít, a kivonatolás viszont ezekre a pontokra nem készített fogalmat. A forrásból betűhíven
 * igazolt hiányzó pont kiegészítő fogalom lesz a job (fókuszált) tudástárában — a „forrás a mérce” szabály így sem sérül.
 */
export const instructionConceptId = (point: string) => `instr-${createHash("sha1").update(point).digest("hex").slice(0, 8)}`;
export function instructionConceptsFrom(points: InstructionPoint[]): MapConcept[] {
  return points.filter((p) => !p.taught && p.sourceQuote).map((p) => ({
    localId: instructionConceptId(p.point),
    term: p.point.slice(0, 80),
    definition: p.point,
    quote: p.sourceQuote,
    examWeight: "supporting" as const,
  } as MapConcept));
}

export const missingPoints = (points: InstructionPoint[]) => points.filter((p) => !p.taught);
