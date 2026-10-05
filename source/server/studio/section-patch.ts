import type { Lesson } from "../../shared/lesson-schema";
import type { RawNote } from "./lektor";

/**
 * Célzott szerzői javítás (spec 2026-09-19 §6, „bank egyszer”).
 *
 * Mérve (run 3aafddb1, e1b57553, 59fcb2af): a szerzői javító kör a TELJES leckét újraírta, a
 * változatlan fejezetek szövege is módosult, ezért a bankcsomagok hash-e megváltozott, és a
 * bank szinte teljesen újraépült (817–1 010 s, a lecke idejének fele). Ha a lektor és a kapu
 * minden tanítási kifogása fejezethez köthető, a szerző csak azokat a fejezeteket kapja vissza
 * javításra `{ "sections": { "<index>": {...} } }` alakban; a runner determinisztikusan egyesíti
 * az előző leckével, így a nem érintett fejezetek bájtra azonosak maradnak.
 */

export type GateFeedbackLike = {
  ok?: boolean;
  missingCore?: string[];
  unknownIds?: string[];
  ungrounded?: Array<{ blockIndex: number; sectionIdx?: number }>;
  arc?: Array<{ sectionIdx: number }>;
  /** Spec 2026-09-30-tanari-ellenorzolista: a tanári kérés hiányzó pontjai (a fejezet nélküli → teljes javítás). */
  instruction?: Array<{ sectionIdx: number | null; point: string }>;
  reasons?: string[];
};

/** "3.2" | "section.3" | "sections.3" | "sections[3]" → 3; bank paths and lesson-level notes → null. */
export function sectionIndexOfPath(blockPath: string | undefined): number | null {
  if (!blockPath) return null;
  const m = blockPath.match(/^(?:sections?\.?|sections\[)?(\d+)(?:\]|\.|$)/);
  if (!m) return null;
  if (/^experience/.test(blockPath)) return null;
  return Number(m[1]);
}

/** A flat block index (as the gate reports it) → section index. */
export function sectionOfFlatBlock(lesson: Pick<Lesson, "sections">, flatIndex: number): number | null {
  let offset = 0;
  for (const [i, section] of lesson.sections.entries()) {
    if (flatIndex < offset + section.blocks.length) return i;
    offset += section.blocks.length;
  }
  return null;
}

/**
 * The sections the author must rewrite, or `null` when a full rewrite is unavoidable
 * (a note or gate finding that is not tied to one section, or nothing to fix).
 * Bank notes (`experience.*`) are the bank builder's, not the author's.
 */
export function targetedRepairSections(
  previous: Pick<Lesson, "sections">,
  notes: ReadonlyArray<Pick<RawNote, "blockPath" | "kind" | "subkind">>,
  gate?: GateFeedbackLike | null,
): number[] | null {
  const targets = new Set<number>();
  for (const note of notes) {
    if (note.subkind === "book_probably_wrong") continue;
    if (note.blockPath && /^experience/.test(note.blockPath)) continue;
    // Spec 2026-10-05-s9 (S9/6): a tévhit-listára mutató jegyzet a foltban javítható (`misconceptions` tömb) — nem kényszerít teljes újraírást.
    if (note.blockPath && /^misconceptions(?:[.[]|$)/.test(note.blockPath)) continue;
    const section = sectionIndexOfPath(note.blockPath);
    if (section === null || section < 0 || section >= previous.sections.length) return null;
    targets.add(section);
  }
  if (gate && gate.ok === false) {
    if (gate.missingCore?.length || gate.unknownIds?.length) return null;
    for (const u of gate.ungrounded ?? []) {
      // U4 (C4): a kapu már fejezettel adja a leletet; a lapított index csak régi kapujelentésnél kell.
      const section = typeof u.sectionIdx === "number" && u.sectionIdx >= 0 && u.sectionIdx < previous.sections.length ? u.sectionIdx : sectionOfFlatBlock(previous, u.blockIndex);
      if (section === null) return null;
      targets.add(section);
    }
    for (const f of gate.arc ?? []) {
      if (f.sectionIdx < 0 || f.sectionIdx >= previous.sections.length) return null;
      targets.add(f.sectionIdx);
    }
    for (const f of gate.instruction ?? []) {
      if (f.sectionIdx === null || f.sectionIdx < 0 || f.sectionIdx >= previous.sections.length) return null;
      targets.add(f.sectionIdx);
    }
    const explained = (gate.ungrounded?.length ?? 0) + (gate.arc?.length ?? 0) + (gate.instruction?.length ?? 0);
    if (!explained && (gate.reasons?.length ?? 0) > 0) return null;
  }
  return targets.size ? [...targets].sort((a, b) => a - b) : null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** `{ "sections": { "1": {...} } }` → Map; a full lesson (array `sections`) → null. */
export function parseSectionPatch(json: unknown): Map<number, unknown> | null {
  if (!isObj(json) || !isObj(json.sections)) return null;
  const out = new Map<number, unknown>();
  for (const [key, value] of Object.entries(json.sections)) {
    if (!/^\d+$/.test(key) || !isObj(value)) return null;
    out.set(Number(key), value);
  }
  return out;
}

/** Spec 2026-10-05-s9 (S9/6): a folt opcionális teljes, javított tévhit-listája (`misconceptions` tömb), ha a szerző küldte. */
export function parseMisconceptionsPatch(json: unknown): unknown[] | null {
  return isObj(json) && Array.isArray(json.misconceptions) ? json.misconceptions : null;
}

/** Replace only the allowed sections; everything else is the previous lesson byte for byte — the misconceptions too, unless the patch
 *  sends a corrected list (S9/6; the result is re-validated by the lesson schema). */
export function mergeSectionPatches(previous: Lesson, patch: Map<number, unknown>, allowed: ReadonlyArray<number>, misconceptions?: unknown[] | null): Lesson {
  const allowedSet = new Set(allowed);
  const sections = structuredClone(previous.sections) as unknown[];
  for (const [index, section] of patch) {
    if (!allowedSet.has(index)) throw new Error(`A(z) ${index + 1}. fejezet nem volt javításra kijelölve.`);
    if (index < 0 || index >= sections.length) throw new Error(`A(z) ${index + 1}. fejezet nem létezik.`);
    sections[index] = section;
  }
  return { ...structuredClone(previous), sections: sections as Lesson["sections"], ...(misconceptions ? { misconceptions: misconceptions as Lesson["misconceptions"] } : {}) };
}
