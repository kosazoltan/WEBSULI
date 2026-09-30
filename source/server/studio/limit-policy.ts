import type { Lesson } from "../../shared/lesson-schema";
import { bankItemPath, bankItemRef, checkBlockPath, checkBlockRef } from "../../shared/bank-item-ref";
import { applyLektorConvergence, classifyNotes, type LektorNote, type RawNote } from "./lektor";
import type { ChoiceFlag } from "./bank-verifier";
import { computeCoverage, type CoverageGateResult, type MapConcept } from "./coverage";

/**
 * Spec 2026-09-30 (docs/specs/2026-09-30-nem-elakado-kozzetetel.md), tulajdonosi döntés: a 95%-os lecke már jó; a hibás
 * banktétel vagy ábra kivehető, a tanításban lévő TÉNYBELI hiba nem publikálható. Ez a modul a körlimit szabályait
 * egy helyen tartja, hogy a lektor lépés és a kapu UGYANÚGY döntsön (a kettő eltérése élő buktató volt).
 */

export const LIMIT_CORE_MIN = 0.95;
export const LIMIT_SUPPORTING_MIN = 0.8;
const INCOMPLETE_PREFIX = "Körlimiten hiányként továbbvitt: ";

/** A lektor lépés és a 7.4 kapu közös besorolása (a kapu eddig konvergencia nélkül sorolt → blokkolómentes lecke halt meg). */
export function classifyReviewNotes(raw: RawNote[], priorBlockers: RawNote[], round: number): LektorNote[] {
  return applyLektorConvergence(classifyNotes(raw), priorBlockers, round).notes;
}

/** A limiten a hiány-jellegű (`coverage_gap`) blokkoló figyelmeztetés lesz: a lecke hiányos lehet, de nem hamis. */
export function downgradeAtLimit(notes: LektorNote[], atLimit: boolean): LektorNote[] {
  if (!atLimit) return notes;
  return notes.map((note) => note.blocking && note.kind === "coverage_gap"
    ? { ...note, severity: "warn", blocking: false, message: `${INCOMPLETE_PREFIX}${note.message}` }
    : note);
}

export type LimitSplit = { removable: ChoiceFlag[]; incomplete: LektorNote[]; factual: LektorNote[] };

/**
 * A limiten maradt blokkolók három csoportja: kivehető (létező banktétel, check vagy ábra), hiányos (`coverage_gap` a
 * tanításban) és ténybeli (minden más — ez nem publikálható).
 */
export function splitLimitBlockers(lesson: Lesson | undefined, blocking: LektorNote[]): LimitSplit {
  const split: LimitSplit = { removable: [], incomplete: [], factual: [] };
  for (const note of blocking) {
    const path = lesson ? removablePath(lesson, note.blockPath) : null;
    if (path) {
      if (!split.removable.some((f) => f.path === path)) split.removable.push({ path, message: note.message, origin: "limit" });
    } else if (note.kind === "coverage_gap") split.incomplete.push(note);
    else split.factual.push(note);
  }
  return split;
}

/** Létező banktétel, check blokk vagy (spec 2026-09-30) ábra normalizált útvonala; minden más → null. */
export function removablePath(lesson: Lesson, blockPath: string | null | undefined): string | null {
  const bank = bankItemRef(blockPath);
  if (bank) return lesson.experience && bank.index < lesson.experience[bank.bank].length ? bankItemPath(bank) : null;
  const ref = checkBlockRef(blockPath);
  const kind = ref ? lesson.sections[ref.section]?.blocks[ref.block]?.kind : undefined;
  return ref && (kind === "check" || kind === "animate") ? checkBlockPath(ref) : null;
}

export type LimitAcceptance = { ok: boolean; lesson: Lesson; core: number; supporting: number; stripped: number };

/**
 * A kapu a limiten: nem-ténybeli lelet (fedettség, ív, megalapozatlan címke) esetén publikálható-e a lecke.
 * A megalapozatlan címke lekerül (ha a blokknak marad másik), a fedettség a MEGALAPOZOTT címkékből számolódik.
 */
export function limitAcceptance(lesson: Lesson, concepts: MapConcept[], gate: Pick<CoverageGateResult, "unknownIds" | "ungrounded">): LimitAcceptance {
  const bad = new Set(gate.ungrounded.map((u) => `${u.blockIndex}:${u.conceptId}`));
  let flat = -1;
  let stripped = 0;
  const grounded = new Set<string>();
  const sections = lesson.sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      flat++;
      if (!("coversConceptIds" in block)) return block;
      const keep = block.coversConceptIds.filter((id) => !bad.has(`${flat}:${id}`));
      for (const id of keep) grounded.add(id);
      if (keep.length === block.coversConceptIds.length || !keep.length) return block;
      stripped += block.coversConceptIds.length - keep.length;
      return { ...block, coversConceptIds: keep };
    }),
  })) as Lesson["sections"];
  const out: Lesson = stripped ? { ...lesson, sections } : lesson;
  const ratio = (weight: "core" | "supporting") => {
    const of = concepts.filter((c) => c.examWeight === weight);
    return of.length ? of.filter((c) => grounded.has(c.localId)).length / of.length : 1;
  };
  const core = ratio("core"), supporting = ratio("supporting");
  const unknown = gate.unknownIds.length > 0 || computeCoverage(out, concepts).unknownIds.length > 0;
  return { ok: !unknown && core >= LIMIT_CORE_MIN && supporting >= LIMIT_SUPPORTING_MIN, lesson: out, core, supporting, stripped };
}
