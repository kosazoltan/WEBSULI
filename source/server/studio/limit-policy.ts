import type { Lesson } from "../../shared/lesson-schema";
import { bankItemPath, bankItemRef, checkBlockPath, checkBlockRef } from "../../shared/bank-item-ref";
import { applyLektorConvergence, classifyNotes, type LektorNote, type RawNote } from "./lektor";
import type { ChoiceFlag } from "./bank-verifier";
import { computeCoverage, type CoverageGateResult, type MapConcept } from "./coverage";
import { planLessonBank } from "../../shared/lesson-bank-plan";

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

/**
 * A limiten a TANÍTÁSI blokkra mutató hiány-jellegű (`coverage_gap`) blokkoló figyelmeztetés lesz: a lecke hiányos lehet,
 * de nem hamis. Review PR #151 (P1): a kivehető elemre (banktétel, check, ábra) mutató jegyzet NEM minősül le — azt a
 * kivételi logika kapja, különben a hibás tétel bent maradna.
 */
export function downgradeAtLimit(notes: LektorNote[], atLimit: boolean, lesson?: Lesson): LektorNote[] {
  if (!atLimit) return notes;
  return notes.map((note) => note.blocking && note.kind === "coverage_gap" && !(lesson && removablePath(lesson, note.blockPath))
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

/**
 * Spec 2026-10-01-limit-blokk-kivetel-bank: a blokk-kivétel után a bankból kikerül minden tétel, amelynek fogalmát a megnevezett
 * fejezet már nem tanítja (explain/example címke); a bankterv a kivétel utáni leckéből újraszámolódik. Mért (f5c23de2): a bank a
 * kivett, megalapozatlan blokkokra épült, a bankkapu ezért elutasított.
 */
export function reconcileBankWithTeaching(lesson: Lesson): { lesson: Lesson; removedItems: string[]; trimSections: number[] } {
  const experience = lesson.experience;
  if (!experience) return { lesson, removedItems: [], trimSections: [] };
  const taught = lesson.sections.map((section) => new Set(section.blocks.flatMap((b) => (b.kind === "explain" || b.kind === "example" ? b.coversConceptIds : []))));
  const removedItems: string[] = [];
  const keep = <T extends { id: string; sectionIndex: number; coversConceptIds: string[] }>(items: T[]) => items.filter((item) => {
    const ok = !!taught[item.sectionIndex] && item.coversConceptIds.every((id) => taught[item.sectionIndex].has(id));
    if (!ok) removedItems.push(item.id);
    return ok;
  });
  const methods = keep(experience.methods), tasks = keep(experience.tasks);
  // A lazítható fejezetek: ahonnan nyílt feladat vagy módszer került ki (a kvízminimum nem lazul).
  const trimSections = [...new Set([...experience.methods.filter((m) => !methods.includes(m)), ...experience.tasks.filter((t) => !tasks.includes(t))].map((i) => i.sectionIndex))];
  const next = { ...experience, methods, tasks, quiz: keep(experience.quiz) };
  if (!removedItems.length) return { lesson, removedItems, trimSections };
  const reconciled: Lesson = { ...lesson, experience: next };
  if (experience.bankPlan) {
    // A korábbi lazítás-jelölés (spec 2026-10-01-limit-csomag-lazitas) az újraszámolt bankterven is megmarad.
    const kept = experience.bankPlan.trimmedSections?.filter((i) => i < lesson.sections.length);
    reconciled.experience = { ...next, bankPlan: { ...planLessonBank(reconciled, experience.version), ...(kept?.length ? { trimmedSections: kept } : {}) } };
  }
  return { lesson: reconciled, removedItems, trimSections };
}

/** Spec 2026-10-01-limit-csomag-lazitas: a megadott fejezetek csomagja lazított (a bankterv jelölése; csak kivételkor). */
export function withTrimmedSections(lesson: Lesson, sections: number[]): Lesson {
  const plan = lesson.experience?.bankPlan;
  if (!plan || !sections.length) return lesson;
  const trimmedSections = [...new Set([...(plan.trimmedSections ?? []), ...sections])].sort((a, b) => a - b);
  return { ...lesson, experience: { ...lesson.experience!, bankPlan: { ...plan, trimmedSections } } };
}

export type LimitAcceptance = { ok: boolean; lesson: Lesson; core: number; supporting: number; stripped: number; removedBlocks: string[]; reason?: string };

/**
 * A kapu a limiten: nem-ténybeli lelet (fedettség, ív, megalapozatlan címke) esetén publikálható-e a lecke.
 * A megalapozatlan címke lekerül, a fedettség a MEGALAPOZOTT címkékből számolódik.
 * Spec 2026-09-30 (U6, C15/H42 — §C-L): ha egy blokk MINDEN címkéje megalapozatlan, eddig változatlanul maradt, és a
 * valótlan címke a 95%-os arány mellett publikálódhatott. Most a címkék lekerülnek; a címke nélkül maradó nem-recap
 * blokk (a célzott javító kör után vagyunk) KIVÉTELRE kerül, a fedettség a kivétel UTÁN mérve. Ha a kivétel üres
 * fejezetet hagyna, a lecke nem publikálható (a fejezet egésze megalapozatlan).
 */
export function limitAcceptance(lesson: Lesson, concepts: MapConcept[], gate: Pick<CoverageGateResult, "unknownIds" | "ungrounded">): LimitAcceptance {
  const bad = new Set(gate.ungrounded.map((u) => `${u.blockIndex}:${u.conceptId}`));
  let flat = -1;
  let stripped = 0;
  const removedBlocks: string[] = [];
  const grounded = new Set<string>();
  const sections = lesson.sections.map((section, si) => ({
    ...section,
    blocks: section.blocks.flatMap((block, bi): Lesson["sections"][number]["blocks"] => {
      flat++;
      if (!("coversConceptIds" in block)) return [block];
      const keep = block.coversConceptIds.filter((id) => !bad.has(`${flat}:${id}`));
      for (const id of keep) grounded.add(id);
      if (keep.length === block.coversConceptIds.length) return [block];
      stripped += block.coversConceptIds.length - keep.length;
      if (!keep.length) { removedBlocks.push(`sections[${si}].blocks[${bi}]`); return []; }
      return [{ ...block, coversConceptIds: keep }];
    }),
  })) as Lesson["sections"];
  const out: Lesson = stripped ? { ...lesson, sections } : lesson;
  const ratio = (weight: "core" | "supporting") => {
    const of = concepts.filter((c) => c.examWeight === weight);
    return of.length ? of.filter((c) => grounded.has(c.localId)).length / of.length : 1;
  };
  const core = ratio("core"), supporting = ratio("supporting");
  const emptied = sections.findIndex((section) => section.blocks.length === 0);
  if (emptied >= 0) return { ok: false, lesson: out, core, supporting, stripped, removedBlocks, reason: `a(z) ${emptied + 1}. fejezet minden blokkja megalapozatlan címkéjű — a kivétel után üres maradna` };
  const unknown = gate.unknownIds.length > 0 || computeCoverage(out, concepts).unknownIds.length > 0;
  return { ok: !unknown && core >= LIMIT_CORE_MIN && supporting >= LIMIT_SUPPORTING_MIN, lesson: out, core, supporting, stripped, removedBlocks };
}
