import { REPAIR_KINDS, type RepairKind } from "./pipeline";
import { workflowEnsureRepairBudget, workflowStepVisitsLeft } from "../workflows/engine";

/**
 * Spec 2026-10-01-javitasi-fokonyv: a körlimit-javítások EGYETLEN főkönyve. A lépésfuttató minden javítás-döntése ezen megy át:
 * egy olvasó (`repairUse`), egy író (`spendRepair`), egy keret-döntés (`canSpendRepair`). A főkönyv a `job.output.repairLedger`-ben
 * él; a régi, szétszórt mezőket csak OLVASSA (a telepítés előtt indult, folytatott jobok miatt), és egyetlen helyről tükörként írja.
 */
export type RepairUse = { used: number; rounds: number[] };
export type RepairLedger = Partial<Record<RepairKind, RepairUse>>;
type Output = Record<string, unknown> | null | undefined;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** A régi mezők jelentése fajtánként (csak olvasásra, visszafelé kompatibilitás). */
function legacyUse(out: Output, kind: RepairKind): RepairUse {
  const o = out ?? {};
  switch (kind) {
    case "bankOnly": {
      const round = num(o.bankOnlyRepairRound);
      const used = num(o.bankOnlyRepairRounds) ?? (round !== undefined ? 1 : 0);
      return { used, rounds: round !== undefined ? [round] : [] };
    }
    case "gateBank": return { used: o.gateBankRepairUsed === true ? 1 : 0, rounds: [] };
    case "targetedGate": { const r = num(o.targetedGateRepairRound); return r !== undefined ? { used: 1, rounds: [r] } : { used: 0, rounds: [] }; }
    case "targetedLektor": { const r = num(o.targetedLektorRepairRound); return r !== undefined ? { used: 1, rounds: [r] } : { used: 0, rounds: [] }; }
    case "instruction": { const r = num(o.instructionRepairRound); return r !== undefined ? { used: 1, rounds: [r] } : { used: 0, rounds: [] }; }
  }
}

export function repairUse(out: Output, kind: RepairKind): RepairUse {
  const entry = (out?.repairLedger as RepairLedger | undefined)?.[kind];
  return entry && typeof entry.used === "number" ? { used: entry.used, rounds: Array.isArray(entry.rounds) ? entry.rounds : [] } : legacyUse(out, kind);
}
export const repairUsed = (out: Output, kind: RepairKind) => repairUse(out, kind).used;
export const repairRemaining = (out: Output, kind: RepairKind) => Math.max(0, REPAIR_KINDS[kind].limit - repairUsed(out, kind));
/** Igaz, ha a fajta javítókörét erre a körre (a javítás körszámára) már elköltötték. */
export const repairSpentForRound = (out: Output, kind: RepairKind, round: number) => repairUse(out, kind).rounds.includes(round);

/** A régi mezők tükre — a főkönyv egyetlen írási pontja adja (a régi mezőket vizsgáló folytatás és tesztek miatt). */
function legacyMirror(kind: RepairKind, next: RepairUse, round: number): Record<string, unknown> {
  switch (kind) {
    case "bankOnly": return { bankOnlyRepairRounds: next.used, bankOnlyRepairRound: round };
    case "gateBank": return { gateBankRepairUsed: true };
    case "targetedGate": return { targetedGateRepairRound: round };
    case "targetedLektor": return { targetedLektorRepairRound: round };
    case "instruction": return { instructionRepairRound: round };
  }
}

/** Az EGYETLEN írási pont: a javítás elköltése a `round` (a javítókör) körszámával; új output-objektumot ad. */
export function spendRepair<T extends Record<string, unknown>>(out: T | null | undefined, kind: RepairKind, round: number): T & { repairLedger: RepairLedger } {
  const prev = repairUse(out, kind);
  const next: RepairUse = { used: prev.used + 1, rounds: [...prev.rounds, round] };
  const ledger: RepairLedger = { ...((out?.repairLedger as RepairLedger | undefined) ?? {}), [kind]: next };
  return { ...(out ?? ({} as T)), ...legacyMirror(kind, next, round), repairLedger: ledger } as T & { repairLedger: RepairLedger };
}

export type RepairBudget = { visitsLeft: (step: string) => number; ensure: (reason: string) => Promise<boolean> };
const workflowBudget: RepairBudget = { visitsLeft: workflowStepVisitsLeft, ensure: workflowEnsureRepairBudget };
const REPAIR_PATH = ["author", "animator", "lektor", "gate"] as const;

/** A szerzői javítóút (a limit ELŐTTI rendes kör) kerete: minden lépésre van látogatás, vagy a dinamikus keret pótolja. */
export async function ensureRepairPath(reason: string, budget: RepairBudget = workflowBudget): Promise<boolean> {
  if (REPAIR_PATH.every((s) => budget.visitsLeft(s) > 0)) return true;
  return budget.ensure(reason);
}

/** Az EGYETLEN keret-döntés: fajtánkénti limit ÉS a javítóút látogatási kerete (dinamikus bővítéssel, ha a fajta engedi). */
export async function canSpendRepair(out: Output, kind: RepairKind, reason: string, budget: RepairBudget = workflowBudget): Promise<boolean> {
  if (repairRemaining(out, kind) <= 0) return false;
  const { steps, dynamicBudget } = REPAIR_KINDS[kind];
  if (steps.every((s) => budget.visitsLeft(s) > 0)) return true;
  if (!dynamicBudget) return false;
  return (await budget.ensure(reason)) && steps.every((s) => budget.visitsLeft(s) > 0);
}
