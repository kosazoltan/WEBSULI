import type { z } from "zod";
import { experienceQuizSchema, methodSchema, openTaskSchema } from "../../shared/lesson-experience";
import type { Lesson } from "../../shared/lesson-schema";
import { bankItemRef, type BankItemRef } from "../../shared/bank-item-ref";
import { experienceProblems } from "../../shared/lesson-experience-validation";
import { verifyLessonSkillBank } from "../../shared/lesson-skill-checks";
import { singleChoiceProblems } from "../../shared/single-choice-check";
import { logger } from "../lib/logger";
import { OrchestrationValidationError, orchestratedRetry, type OrchestrationDeps } from "./orchestrated-retry";

/**
 * Spec 2026-10-05-s9 (S9/3, tulajdonosi döntés az élő próba után): a kapunál a körlimit után maradt hibás banktétel nem állítja
 * meg a futást — az orkesztrátor javító utasításával a bankmodell újraírja, és CSAK akkor kerül vissza, ha a teljes bank minden
 * determinisztikus ellenőrzésén ÉS a független bank-ellenőrön átmegy. A kapu mércéje nem változik. Mért: job c1f9d12a,
 * `quiz[23]` két helyes opciója a körlimit után.
 */
export const GATE_REPAIR_MAX_ITEMS = 5;

const ITEM_SCHEMAS: Record<BankItemRef["bank"], z.ZodTypeAny> = { quiz: experienceQuizSchema, tasks: openTaskSchema, methods: methodSchema };

export type GateRepairDeps = OrchestrationDeps & {
  /** A bankmodell hívása (szerep: bank) — a javított rendszerprompttal; JSON-t ad vissza. */
  callBank: (system: string, user: string) => Promise<unknown>;
  /** A független bank-ellenőr CSAK erre az útvonalra; üres lista = ítélet és hiba nélkül átment. */
  verify: (lesson: Lesson, path: string) => Promise<string[]>;
  bankModel: string;
  bankSystem: string;
};

type Flag = { path: string; message: string };

function itemOf(lesson: Lesson, ref: BankItemRef): Record<string, unknown> | undefined {
  return lesson.experience?.[ref.bank]?.[ref.index] as Record<string, unknown> | undefined;
}

function withItem(lesson: Lesson, ref: BankItemRef, item: unknown): Lesson {
  const experience = lesson.experience!;
  const bank = [...experience[ref.bank]] as unknown[];
  bank[ref.index] = item;
  return { ...lesson, experience: { ...experience, [ref.bank]: bank } as Lesson["experience"] };
}

/** A tétel kötése (id, fejezet, fogalmak, kvíz-szándék) nem változhat — különben más tételt csempészne be. */
function bindingProblems(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["id", "sectionIndex", "intent"]) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out.push(`a(z) ${key} mező nem változhat (volt: ${JSON.stringify(before[key])})`);
  if (JSON.stringify(before.coversConceptIds) !== JSON.stringify(after.coversConceptIds)) out.push("a coversConceptIds nem változhat");
  return out;
}

function choiceProblems(ref: BankItemRef, item: Record<string, unknown>, lessonTitle: string): string[] {
  if (ref.bank === "quiz") return singleChoiceProblems({ prompt: String(item.question ?? lessonTitle), options: item.options as string[], correctIndex: item.correctIndex as number });
  if (ref.bank === "methods" && Array.isArray(item.options) && typeof item.correctIndex === "number") return singleChoiceProblems({ prompt: String(item.prompt ?? ""), options: item.options as string[], correctIndex: item.correctIndex });
  return [];
}

export async function repairFlaggedBankItems(args: { lesson: Lesson; flags: Flag[]; round: number; subject?: string; deps: GateRepairDeps }): Promise<{ lesson: Lesson; repaired: string[] } | null> {
  const { deps } = args;
  let lesson = args.lesson;
  const repaired: string[] = [];
  const targets = args.flags.map((f) => ({ ...f, ref: bankItemRef(f.path) })).filter((f): f is Flag & { ref: BankItemRef } => !!f.ref && !!itemOf(args.lesson, f.ref));
  if (!targets.length || targets.length > GATE_REPAIR_MAX_ITEMS) return null;
  for (const t of targets) {
    const before = itemOf(lesson, t.ref)!;
    const section = lesson.sections[Number(before.sectionIndex)];
    const user = JSON.stringify({
      feladat: "Írd újra EZT az egy banktételt úgy, hogy a megnevezett hiba megszűnjön. Csak a javított tétel JSON-ját add vissza, ugyanazokkal az id, sectionIndex, coversConceptIds (és kvíznél intent) mezőkkel.",
      hiba: t.message, bank: t.ref.bank, tetel: before, fejezetTanitasa: section ? JSON.stringify(section).slice(0, 6000) : null,
    });
    const result = await orchestratedRetry(
      { role: "bank", step: "bank", model: deps.bankModel, system: deps.bankSystem, user, point: `gate:${args.round}:${t.path}`, round: args.round, ...(args.subject ? { subject: args.subject } : {}) },
      { kind: "gate", reasons: [t.message], rawOutput: JSON.stringify(before) },
      async (corrected) => {
        const raw = await deps.callBank(corrected, user);
        const candidate = (raw && typeof raw === "object" && !Array.isArray(raw) && "tetel" in raw ? (raw as { tetel: unknown }).tetel : raw) as Record<string, unknown>;
        const parsed = ITEM_SCHEMAS[t.ref.bank].safeParse(candidate);
        if (!parsed.success) throw new OrchestrationValidationError("gate", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), JSON.stringify(candidate).slice(0, 6000));
        const item = parsed.data as Record<string, unknown>;
        const problems = [...bindingProblems(before, item), ...choiceProblems(t.ref, item, lesson.title)];
        const next = withItem(lesson, t.ref, item);
        problems.push(...experienceProblems(next), ...verifyLessonSkillBank(next.experience, next.subject, next.sections).problems);
        if (problems.length) throw new OrchestrationValidationError("gate", problems, JSON.stringify(item).slice(0, 6000));
        // A független bank-ellenőr ítélete (ugyanaz a mérce, mint a lektor-körben) — csak ezen az útvonalon.
        const verdict = await deps.verify(next, t.path);
        if (verdict.length) throw new OrchestrationValidationError("gate", verdict, JSON.stringify(item).slice(0, 6000));
        return next;
      },
      deps,
    );
    if (!result) { logger.warn(`[ORKESZTRÁTOR] kapu: ${t.path} nem javítható — a régi hibaút.`); return null; }
    lesson = result.value;
    repaired.push(t.path);
  }
  return { lesson, repaired };
}
