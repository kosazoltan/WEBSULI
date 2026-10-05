import type { z } from "zod";
import { experienceQuizSchema, methodSchema, openTaskSchema } from "../../shared/lesson-experience";
import type { Lesson } from "../../shared/lesson-schema";
import { bankItemPath, bankItemRef, type BankItemRef } from "../../shared/bank-item-ref";
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
/** Spec S11/6 + S9/7 (mért: job 8953db4b, 6 cél → eddig NÉMÁN kimaradt): egy ADAG legfeljebb ennyi tétel. */
export const GATE_REPAIR_MAX_ITEMS = 5;
/** A futásonkénti keret: ennyi adag (≤ GATE_REPAIR_MAX_ITEMS × GATE_REPAIR_MAX_BATCHES tétel); fölötte a kihagyás naplózva. */
export const GATE_REPAIR_MAX_BATCHES = 2;

const ITEM_SCHEMAS: Record<BankItemRef["bank"], z.ZodTypeAny> = { quiz: experienceQuizSchema, tasks: openTaskSchema, methods: methodSchema };

export type GateRepairDeps = OrchestrationDeps & {
  /** A bankmodell hívása (szerep: bank) — a javított rendszerprompttal; JSON-t ad vissza. */
  /** `round`: az orkesztrált kör (1, 2) — a hívó a 2. körben erősebb modellre eszkalálhat (S9/4). */
  callBank: (system: string, user: string, round: number) => Promise<unknown>;
  /** A független bank-ellenőr CSAK erre az útvonalra; üres lista = ítélet és hiba nélkül átment. */
  verify: (lesson: Lesson, path: string) => Promise<string[]>;
  bankModel: string;
  bankSystem: string;
};

type Flag = { path: string; message: string };

/**
 * Spec 2026-10-05-s9 (S9/5, tulajdonosi döntés; mért: job c1f9d12a): a lektor / bank-ellenőr KÖTÖTT formátumú üzenete („Mi hamis:
 * <tétel> | Bizonyíték: … | Javítás iránya: …” — a skill írja elő) a hibás tételt nevezi meg. Ha ez MÁS tétel, mint a jelzés
 * útvonala, a jelzés téves útvonalú (mért: útvonal tasks[6], szöveg „Mi hamis: tasks[28] … tasks[6] javítva”).
 */
const NAMED_ITEM = /Mi hamis:\s*(?:experience\.)?(quiz|methods|tasks)\s*(?:\[\s*(\d+)\s*\]|\.(\d+))/u;
export function namedItemRef(message: string): BankItemRef | null {
  const m = NAMED_ITEM.exec(message);
  if (!m) return null;
  const index = Number(m[2] ?? m[3]);
  return Number.isSafeInteger(index) ? { bank: m[1] as BankItemRef["bank"], index } : null;
}
const sameItem = (a: BankItemRef, b: BankItemRef) => a.bank === b.bank && a.index === b.index;

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

const bankProblems = (lesson: Lesson) => [...experienceProblems(lesson), ...verifyLessonSkillBank(lesson.experience, lesson.subject, lesson.sections).problems];
/** A probléma ezt a tételt nevezi meg (id-előtag vagy `bank.index` / `bank[index]` útvonal). */
function mentionsItem(problem: string, ref: BankItemRef, id: unknown): boolean {
  if (typeof id === "string" && id && (problem.startsWith(`${id}:`) || problem.includes(` ${id}:`))) return true;
  return new RegExp(`(^|[^\\w])${ref.bank}(\\.|\\[)${ref.index}(?!\\d)`, "u").test(problem);
}

export type GateRepairTarget = Flag & { ref: BankItemRef };

/**
 * A javítási célok (tiszta): a téves útvonalú jelzésnél a megnevezett tétel javítást, a jelzett csak ellenőrzést kap;
 * `skipped`: a nem banktétel-útvonalú / nem létező tételre mutató jelzés (a hívó naplózza — nincs néma kihagyás).
 */
export function planGateRepair(lesson: Lesson, flags: Flag[]): { targets: GateRepairTarget[]; checkOnly: Set<string>; skipped: string[] } {
  const skipped: string[] = [];
  const flagged = flags.map((f) => ({ ...f, ref: bankItemRef(f.path) })).filter((f): f is GateRepairTarget => {
    const ok = !!f.ref && !!itemOf(lesson, f.ref);
    if (!ok) skipped.push(f.path);
    return ok;
  });
  // Téves útvonalú jelzés: a jelzett tétel csak ellenőrzést kap (a független ellenőr dönt), a megnevezett tétel javítást.
  const checkOnly = new Set<string>();
  const targets: GateRepairTarget[] = [];
  for (const f of flagged) {
    const named = namedItemRef(f.message);
    if (named && !sameItem(named, f.ref) && itemOf(lesson, named)) {
      checkOnly.add(bankItemPath(f.ref));
      if (!targets.some((x) => sameItem(x.ref, named)) && !flagged.some((x) => sameItem(x.ref, named))) targets.push({ path: bankItemPath(named), message: f.message, ref: named });
    }
    if (!targets.some((x) => sameItem(x.ref, f.ref))) targets.push(f);
  }
  return { targets, checkOnly, skipped };
}

/** Az adagok (≤ GATE_REPAIR_MAX_ITEMS tétel); a futásonkénti keret fölött `null` (a hívó naplózza). */
export function gateRepairBatches<T>(targets: T[]): T[][] | null {
  if (targets.length > GATE_REPAIR_MAX_ITEMS * GATE_REPAIR_MAX_BATCHES) return null;
  const out: T[][] = [];
  for (let k = 0; k < targets.length; k += GATE_REPAIR_MAX_ITEMS) out.push(targets.slice(k, k + GATE_REPAIR_MAX_ITEMS));
  return out;
}

/**
 * Spec S11/6 + S9/7: a célok legfeljebb 5-ös ADAGOKBAN (legfeljebb 2 adag); tételenként a meglévő ellenőrzés, adagonként a bank
 * új / az adag tételeit megnevező hibáinak ellenőrzése, az összes után teljes validálás. Minden kihagyás és bukás okkal naplózva.
 * Részleges eredmény nincs: bármely bukás → `null` (a régi hibaút).
 */
export async function repairFlaggedBankItems(args: { lesson: Lesson; flags: Flag[]; round: number; subject?: string; deps: GateRepairDeps }): Promise<{ lesson: Lesson; repaired: string[]; batches: number } | null> {
  let lesson = args.lesson;
  const repaired: string[] = [];
  const { targets, checkOnly, skipped } = planGateRepair(args.lesson, args.flags);
  for (const path of skipped) logger.warn(`[ORKESZTRÁTOR] kapu: a(z) ${path} jelzés nem banktételre mutat (nem bank-útvonal / nincs ilyen tétel) — kapu-javítás nélkül.`);
  if (!targets.length) {
    logger.warn(`[ORKESZTRÁTOR] kapu: nincs javítható banktétel-cél (${args.flags.length} jelzés) — a régi hibaút.`);
    return null;
  }
  const batches = gateRepairBatches(targets);
  if (!batches) {
    logger.warn(`[ORKESZTRÁTOR] kapu: ${targets.length} javítási cél > a futásonkénti keret (${GATE_REPAIR_MAX_BATCHES} adag × ${GATE_REPAIR_MAX_ITEMS} tétel) — a kapu-javítás kimarad, a régi hibaút.`);
    return null;
  }
  for (const [b, batch] of batches.entries()) {
    logger.info(`[ORKESZTRÁTOR] kapu: ${b + 1}/${batches.length}. adag (${batch.length} tétel): ${batch.map((t) => t.path).join(", ")}.`);
    const batchBaseline = new Set(bankProblems(lesson));
    for (const t of batch) {
      const next = await repairOneTarget(lesson, t, checkOnly.has(bankItemPath(t.ref)), args, repaired);
      if (!next) { logger.warn(`[ORKESZTRÁTOR] kapu: ${t.path} nem javítható (${b + 1}/${batches.length}. adag) — a régi hibaút.`); return null; }
      lesson = next;
    }
    // Adagonként: az adag nem hozhat új bankhibát, és az adag tételeit megnevező hiba sem maradhat (a későbbi adagok hibái nem buktatják).
    const fresh = bankProblems(lesson).filter((p) => !batchBaseline.has(p) || batch.some((t) => mentionsItem(p, t.ref, itemOf(lesson, t.ref)?.id)));
    if (fresh.length) { logger.warn(`[ORKESZTRÁTOR] kapu: a(z) ${b + 1}. adag utáni ellenőrzés bukott (${fresh.slice(0, 3).join(" | ")}) — a régi hibaút.`); return null; }
  }
  if (lesson !== args.lesson) {
    const remaining = bankProblems(lesson);
    if (remaining.length) { logger.warn(`[ORKESZTRÁTOR] kapu: a javított bank teljes ellenőrzése bukott (${remaining.slice(0, 3).join(" | ")}) — a régi hibaút.`); return null; }
  }
  return { lesson, repaired, batches: batches.length };
}

/** Egy cél javítása a meglévő tételenkénti ellenőrzéssel: a javított lecke, vagy `null`. Sikernél a `repaired` listába ír. */
async function repairOneTarget(lesson: Lesson, t: GateRepairTarget, checkOnly: boolean, args: { round: number; subject?: string; deps: GateRepairDeps }, repaired: string[]): Promise<Lesson | null> {
  const { deps } = args;
  let message = t.message;
  // Téves útvonal: a tétel változatlanul a független ellenőr elé kerül; csak hibátlan ítéletnél szűnik meg a jelzése.
  if (checkOnly) {
    const verdict = await deps.verify(lesson, t.path);
    if (!verdict.length) {
      logger.info(`[ORKESZTRÁTOR] kapu: ${t.path} jelzése téves útvonalú (az üzenet más tételt nevez meg) — a független ellenőr hibátlannak ítélte.`);
      repaired.push(t.path);
      return lesson;
    }
    // Review #192: a javítás a független ellenőr ítéletét kapja (az eredeti üzenet MÁS tételt nevez meg).
    message = verdict.join(" | ");
  }
  const before = itemOf(lesson, t.ref)!;
  // Review #192: a többi (még javítatlan) jelzett tétel hibája nem buktathatja ezt a javítást — tételenként csak az ÚJ, vagy
  // EZT a tételt megnevező bankhiba számít; a végén egy teljes ellenőrzés.
  const baseline = new Set(bankProblems(lesson));
  const section = lesson.sections[Number(before.sectionIndex)];
  const user = JSON.stringify({
    feladat: "Írd újra EZT az egy banktételt úgy, hogy a megnevezett hiba megszűnjön. Csak a javított tétel JSON-ját add vissza, ugyanazokkal az id, sectionIndex, coversConceptIds (és kvíznél intent) mezőkkel.",
    hiba: message, bank: t.ref.bank, tetel: before, fejezetTanitasa: section ? JSON.stringify(section).slice(0, 6000) : null,
  });
  const result = await orchestratedRetry(
    { role: "bank", step: "bank", model: deps.bankModel, system: deps.bankSystem, user, point: `gate:${args.round}:${t.path}`, round: args.round, ...(args.subject ? { subject: args.subject } : {}) },
    { kind: "gate", reasons: [message], rawOutput: JSON.stringify(before) },
    async (corrected, n) => {
      const raw = await deps.callBank(corrected, user, n);
      const candidate = (raw && typeof raw === "object" && !Array.isArray(raw) && "tetel" in raw ? (raw as { tetel: unknown }).tetel : raw) as Record<string, unknown>;
      const parsed = ITEM_SCHEMAS[t.ref.bank].safeParse(candidate);
      if (!parsed.success) throw new OrchestrationValidationError("gate", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), JSON.stringify(candidate).slice(0, 6000));
      const item = parsed.data as Record<string, unknown>;
      // S9/4 (mért: a bankmodell kétszer változatlanul adta vissza a tételt): a javítás meg sem történt → azonnal, a független
      // ellenőr (drága) hívása nélkül; az orkesztrátor ezt a pontos okot kapja.
      if (JSON.stringify(item) === JSON.stringify(ITEM_SCHEMAS[t.ref.bank].safeParse(before).data ?? before)) {
        throw new OrchestrationValidationError("gate", ["a tétel VÁLTOZATLAN — a kért javítás nem történt meg; a megnevezett hibát a tétel szövegében ténylegesen meg kell szüntetni"], JSON.stringify(item).slice(0, 6000));
      }
      const problems = [...bindingProblems(before, item), ...choiceProblems(t.ref, item, lesson.title)];
      const next = withItem(lesson, t.ref, item);
      problems.push(...bankProblems(next).filter((p) => !baseline.has(p) || mentionsItem(p, t.ref, before.id)));
      if (problems.length) throw new OrchestrationValidationError("gate", problems, JSON.stringify(item).slice(0, 6000));
      // A független bank-ellenőr ítélete (ugyanaz a mérce, mint a lektor-körben) — csak ezen az útvonalon.
      const verdict = await deps.verify(next, t.path);
      if (verdict.length) throw new OrchestrationValidationError("gate", verdict, JSON.stringify(item).slice(0, 6000));
      return next;
    },
    deps,
  );
  if (!result) return null;
  repaired.push(t.path);
  return result.value;
}
