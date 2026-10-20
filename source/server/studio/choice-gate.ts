/**
 * Fail-closed egyválasztós kapu (spec 2026-09-29, egy-helyes-valasz) és a nyitott bankleletek feloldása — determinisztikus, modellhívás
 * nélkül. docs/specs/2026-10-16-egy-futas.md (S4b): a régi lépésgépből (`step-runner.ts`) változatlanul áthelyezve; az egyfutásos motor
 * végkapuja használja.
 */
import type { Lesson } from "../../shared/lesson-schema";
import { experienceProblems } from "../../shared/lesson-experience-validation";
import { verifyLessonSkillBank } from "../../shared/lesson-skill-checks";
import { lessonSingleChoiceProblems } from "../../shared/single-choice-check";
import { bankItemPath, bankItemRef, checkBlockPath, checkBlockRef, misconceptionPath, misconceptionRef, type BankItemRef } from "../../shared/bank-item-ref";
import { applyLimitRelaxation, splitLimitBlockers } from "./limit-policy";
import type { LektorNote } from "./lektor";

/** Egy nyitott jelzés a kapunak: a tétel / blokk útvonala, az ok, és az eredete (körlimit / aritmetikai lelet). */
export type ChoiceFlag = { path: string; message: string; origin?: "limit" | "arithmetic" };

/**
 * Spec 2026-09-30 (U2, H52): az utolsó bankkísérlet nyitott aritmetikai leletei a kapun kivehető tételként jelennek meg
 * (limit-tábla), a végleges tétel-azonosítóból a lecke aktuális bankjának útvonalára feloldva. A már nem létező tétel
 * (időközben kivették/újraépült) nem jelez.
 */
export function openBankFindingFlags(lesson: Lesson, raw: unknown): ChoiceFlag[] {
  if (!Array.isArray(raw) || !lesson.experience) return [];
  const flags: ChoiceFlag[] = [];
  for (const f of raw as Array<{ itemId?: unknown; message?: unknown }>) {
    if (typeof f?.itemId !== "string") continue;
    for (const bank of ["tasks", "quiz", "methods"] as const) {
      const index = lesson.experience[bank].findIndex((item) => item.id === f.itemId);
      if (index >= 0) flags.push({ path: bankItemPath({ bank, index }), message: `nyitott aritmetikai lelet: ${String(f.message ?? "")}`, origin: "arithmetic" });
    }
  }
  return flags;
}
export function resolveChoiceGate(lesson: Lesson, rawFlags: unknown): { lesson: Lesson; removed: string[]; trimmed?: number[]; limitRelaxed?: true } | { error: string } {
  const flags = new Map<string, string>();
  for (const f of lessonSingleChoiceProblems(lesson)) flags.set(f.path, `${f.path}: ${f.problems.join(" ")}`);
  const limitOrigin = new Set<string>();
  for (const f of Array.isArray(rawFlags) ? rawFlags as ChoiceFlag[] : []) {
    if (typeof f?.path === "string" && !flags.has(f.path)) flags.set(f.path, `${f.path}: ${String(f.message ?? "")}`);
    if (typeof f?.path === "string" && f.origin === "limit") limitOrigin.add(f.path);
  }
  if (!flags.size) return { lesson, removed: [] };
  // Spec 2026-09-29-limit-banktetel-kivetel: normalizált hivatkozás (zárójeles, pontozott, al-útvonal), a tasks bank is.
  const byBank: Record<BankItemRef["bank"], Set<number>> = { quiz: new Set(), methods: new Set(), tasks: new Set() };
  const checkBlocks = new Map<number, Set<number>>();
  const removedMisconceptions = new Set<number>();
  const removed = new Map<string, string>();
  const blocking: string[] = [];
  for (const [path, message] of flags) {
    const ref = bankItemRef(path);
    const check = checkBlockRef(path);
    const misconception = misconceptionRef(path);
    // Spec 2026-10-05-s9 (S9/6): a körlimiten maradt ténybeli hiba a tévhit-lista elemén → az elem kikerül (mint a hibás banktétel).
    if (misconception !== null && limitOrigin.has(path) && misconception < lesson.misconceptions.length) {
      removedMisconceptions.add(misconception);
      removed.set(misconceptionPath(misconception), message);
      continue;
    }
    if (ref && lesson.experience && ref.index < lesson.experience[ref.bank].length) {
      byBank[ref.bank].add(ref.index);
      removed.set(bankItemPath(ref), message);
    } else if (check && limitOrigin.has(path) && ["check", "animate"].includes(lesson.sections[check.section]?.blocks[check.block]?.kind ?? "")) {
      // Spec 2026-09-30-nem-elakado-kozzetetel (D2): a körlimiten blokkolt ÁBRA is kivehető (a tanítás marad).
      // Spec 2026-09-29-limit-check-kivetel: a körlimiten lektor által blokkolt ellenőrző kérdés kivehető; a limit-jelzés
      // nélküli (determinisztikus őr által talált) check-hiba továbbra is buktat (#134, E4).
      if (!checkBlocks.has(check.section)) checkBlocks.set(check.section, new Set());
      checkBlocks.get(check.section)!.add(check.block);
      removed.set(checkBlockPath(check), message);
    } else blocking.push(message);
  }
  const all = [...flags.values()].join("; ");
  if (blocking.length) return { error: `Egyválasztós hiba maradt a leckében, nem publikálható (pontosan egy helyes opció kell): ${blocking.join("; ")}` };
  const experience = lesson.experience!;
  let reduced: Lesson = { ...lesson,
    misconceptions: removedMisconceptions.size ? lesson.misconceptions.filter((_, i) => !removedMisconceptions.has(i)) : lesson.misconceptions,
    sections: checkBlocks.size
      ? lesson.sections.map((section, i) => (checkBlocks.has(i) ? { ...section, blocks: section.blocks.filter((_, j) => !checkBlocks.get(i)!.has(j)) } : section))
      : lesson.sections,
    experience: {
    ...experience,
    quiz: experience.quiz.filter((_, i) => !byBank.quiz.has(i)),
    methods: experience.methods.filter((_, i) => !byBank.methods.has(i)),
    tasks: experience.tasks.filter((_, i) => !byBank.tasks.has(i)),
  } };
  // Spec 2026-10-01-gyokerok-egyben (2.1): LIMIT-eredetű banktétel-kivétel után a bank mércéje a publikálási padló — EGY helyen,
  // determinisztikusan (nem „újramérés, ha hibás”); az aritmetikai/egyéb eredetű kivétel szabálya változatlan.
  const limitRemoved = [...limitOrigin].map((p) => bankItemRef(p)).filter((r): r is BankItemRef => !!r && r.index < experience[r.bank].length);
  const trimmedSections = [...new Set(limitRemoved.filter((r) => r.bank !== "quiz").map((r) => experience[r.bank][r.index].sectionIndex))];
  if (limitRemoved.length) reduced = applyLimitRelaxation(reduced, trimmedSections);
  const after = [...experienceProblems(reduced), ...verifyLessonSkillBank(reduced.experience, reduced.subject, reduced.sections).problems];
  if (after.length) {
    const fromLimit = limitOrigin.size > 0;
    return { error: fromLimit
      ? `Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg — nem publikálható: ${all} (kivétel után: ${after.join("; ")})`
      : `Egyválasztós hiba maradt a bankban, és a tételek kivétele után a bank nem felelne meg — nem publikálható: ${all} (kivétel után: ${after.join("; ")})` };
  }
  return { lesson: reduced, removed: [...removed.keys()], ...(limitRemoved.length ? { trimmed: trimmedSections, limitRelaxed: true as const } : {}) };
}

/**
 * Spec 2026-10-20-elakadas-gyokerok-elemzes (R1) + review #331: ha a lektor MINDEN blokkoló jegyzete létező GYAKORLÓBANK-tételre mutat
 * (`experience.tasks|quiz|methods[i]`), nincs eltérő tanítási megoldás (`solutions[].match === false`), és van bank, a tételek kikerülnek
 * (a padló a körlimit szabálya szerint lazul); különben hiba. Tanítási elem (ellenőrző blokk, ábra, tévhit) itt NEM vehető ki — az a
 * tanítás része (a terv szerint a régi megállás). Mért (30 nap): 8 futás állt meg az utolsó lektorkörben kivehető banktétel miatt.
 */
export function removeLektorBlockers(lesson: Lesson, blocking: LektorNote[], solutions?: ReadonlyArray<{ match: boolean }>): { lesson: Lesson; removed: string[] } | { error: string } {
  if (!lesson.experience) return { error: "a leckének nincs gyakorlóbankja" };
  if ((solutions ?? []).some((sol) => !sol.match)) return { error: "a lektor eltérő tanítási megoldást jelzett" };
  const nonBank = blocking.filter((n) => !bankItemRef(n.blockPath));
  if (nonBank.length) return { error: `nem banktétel: ${nonBank.map((n) => `${n.blockPath ?? "—"}: ${n.message}`).join("; ")}` };
  const split = splitLimitBlockers(lesson, blocking);
  if (!split.removable.length || split.factual.length || split.incomplete.length) {
    const rest = [...split.factual, ...split.incomplete].map((n) => `${n.blockPath ?? "—"}: ${n.message}`);
    return { error: rest.length ? `nem kivehető jegyzet: ${rest.join("; ")}` : "nincs kivehető tétel" };
  }
  const removal = resolveChoiceGate(lesson, split.removable);
  return "error" in removal ? removal : { lesson: removal.lesson, removed: removal.removed };
}
