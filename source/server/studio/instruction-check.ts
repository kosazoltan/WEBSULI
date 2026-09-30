import { createHash } from "node:crypto";
import type { Lesson } from "../../shared/lesson-schema";
import { withSupportSkill } from "./support-skills";

/**
 * Spec 2026-09-30-tanari-ellenorzolista: a tanári kérés pontjainak mérése a kész leckén.
 *
 * A kérés eddig csak prompt-bemenet volt (a kész leckén semmi nem mérte). Élő eset (Mezopotámia): a kért „Babilon városa
 * Kr. e. 2500 körül” pont csak „szerepel a füzetben” alakban jelent meg. A modell pontonként dönt, de a „tanítja”
 * döntés csak a lecke szövegéből betűhíven kimásolt bizonyítékkal fogadható el (hallucináció-őr).
 */

export const INSTRUCTION_CHECK_MODEL = "claude-opus-5-5";

export type InstructionPoint = { point: string; taught: boolean; evidence: string; section: number | null };
export type InstructionCheck = { hash: string; points: InstructionPoint[] };

/** A lecke tanítása fejezetenként (cím, explain, példa, összefoglaló) — ezt kapja a modell és ebben keresünk bizonyítékot. */
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

export function instructionCheckHash(instruction: string, lesson: Lesson): string {
  return createHash("sha256").update(`${instruction}\n---\n${teachingText(lesson)}`).digest("hex");
}

export function buildInstructionCheckPrompt(instruction: string, lesson: Lesson): { system: string; user: string } {
  return {
    system: withSupportSkill("instruction-checker", "Mérd a tanár kérését a lecke tanításához a skill szerint. Kizárólag a kért JSON-t add vissza."),
    user: JSON.stringify({ title: lesson.title, classroom: lesson.classroom, instruction, lesson: teachingText(lesson) }),
  };
}

const norm = (s: string) => s.toLocaleLowerCase("hu").replace(/\*\*/g, "").replace(/[„”"'’]/g, "").replace(/\s+/g, " ").trim();

/** A modell válasza pontokká; a bizonyíték nélküli (vagy nem betűhív) „tanítja” hiánynak számít. */
export function parseInstructionCheck(json: unknown, lesson: Lesson): InstructionPoint[] {
  const raw = (json as { points?: unknown } | null)?.points;
  if (!Array.isArray(raw)) throw new Error("a tanári kérés mérése nem a kért alakú JSON");
  const haystack = norm(teachingText(lesson));
  return raw.flatMap((item) => {
    const p = item as { point?: unknown; taught?: unknown; evidence?: unknown; section?: unknown };
    if (typeof p?.point !== "string" || !p.point.trim()) return [];
    const evidence = typeof p.evidence === "string" ? p.evidence.trim() : "";
    // Review #152: a hossz a NORMALIZÁLT bizonyítékon mérve (a „********” normalizálva üres, az includes("") mindig igaz).
    const normalized = norm(evidence);
    const proven = p.taught === true && normalized.replace(/[^\p{L}\p{N}]/gu, "").length >= 8 && haystack.includes(normalized);
    const section = Number.isInteger(p.section) && (p.section as number) >= 0 && (p.section as number) < lesson.sections.length ? p.section as number : null;
    return [{ point: p.point.trim().slice(0, 300), taught: proven, evidence: proven ? evidence : "", section }];
  });
}

export const missingPoints = (points: InstructionPoint[]) => points.filter((p) => !p.taught);
