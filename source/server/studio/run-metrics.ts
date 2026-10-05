import { repairUse } from "./repair-ledger";

/**
 * Spec 2026-10-05-s0-meresi-alap: a tudásbank-program mércéje. Tiszta függvények — modellhívás és DB nélkül; a script
 * (`scripts/studio/baseline-metrics.mts`) csak olvas, és ugyanezzel a mércével mér minden későbbi szelet előtt és után.
 */

export type FailureClass =
  | "bank_floor_after_removal"
  | "single_choice_left"
  | "factual_at_limit"
  | "coverage_grounding"
  | "bank_packet"
  | "animator_contract"
  | "schema_code"
  | "infrastructure"
  | "budget_engine"
  | "source_extraction"
  | "other";

/** A bukás-üzenet osztálya — a sorrend számít (a specifikusabb minta előbb). */
const RULES: Array<[RegExp, FailureClass]> = [
  [/kivétel után a bank nem felelne meg|kivétele után a fúziós bank|bank nem felel/i, "bank_floor_after_removal"],
  [/Egyválasztós hiba/i, "single_choice_left"],
  [/tényhiba maradt|tartalmi javítást kér/i, "factual_at_limit"],
  [/bankcsomagja|bankcsomag/i, "bank_packet"],
  [/animátor megsértette|animator.*szerződés/i, "animator_contract"],
  [/tanítása hiányos|fedettség|megalapozatlan|vázlat nem felel meg a térképnek/i, "coverage_grounding"],
  [/szerver újraindult|megszakadt|leállítva|Élő próba|szolgáltató hibát jelzett|quota|credits|insufficient|timeout|429/i, "infrastructure"],
  [/lépés-határ|látogatás|keret|Váratlan/i, "budget_engine"],
  [/alakilag hibás|JSON|séma|is not a function|Ismeretlen hiba/i, "schema_code"],
  [/forrás|OCR|átirat|kivonat/i, "source_extraction"],
];

export function classifyFailure(error: string | null | undefined): FailureClass {
  const e = error ?? "";
  for (const [re, cls] of RULES) if (re.test(e)) return cls;
  return "other";
}

export type JobRow = {
  id: string;
  subject: string | null;
  step: string;
  status: string;
  error: string | null;
  output: Record<string, unknown> | null;
};
export type NoteCounts = { total: number; bank: number; teach: number };

export type JobMetrics = {
  id: string;
  subject: string;
  success: boolean;
  failed: boolean;
  failureClass: FailureClass | null;
  bankOnlyRounds: number;
  targetedGate: number;
  gateBank: number;
  lektorNotes: number;
  lektorBankNotes: number;
  lektorTeachNotes: number;
};

/** A tantárgy-név egységesítése (a DB-ben „Természetismeret” és „természetismeret” is áll). */
export const normalizeSubject = (s: string | null | undefined): string => {
  const t = (s ?? "").trim();
  return t ? t.charAt(0).toLocaleUpperCase("hu") + t.slice(1).toLocaleLowerCase("hu") : "Ismeretlen";
};

export function jobMetrics(row: JobRow, notes: NoteCounts = { total: 0, bank: 0, teach: 0 }): JobMetrics {
  const success = row.step === "done";
  const failed = row.step === "error" || row.status === "error";
  return {
    id: row.id,
    subject: normalizeSubject(row.subject),
    success,
    failed: failed && !success,
    failureClass: failed && !success ? classifyFailure(row.error) : null,
    bankOnlyRounds: repairUse(row.output, "bankOnly").used,
    targetedGate: repairUse(row.output, "targetedGate").used,
    gateBank: repairUse(row.output, "gateBank").used,
    lektorNotes: notes.total,
    lektorBankNotes: notes.bank,
    lektorTeachNotes: notes.teach,
  };
}

export type SubjectSummary = {
  subject: string;
  runs: number;
  success: number;
  successRate: number;
  failures: Partial<Record<FailureClass, number>>;
  avgBankNotes: number;
  avgTeachNotes: number;
  avgBankOnlyRounds: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function subjectSummary(metrics: JobMetrics[]): SubjectSummary[] {
  const groups = new Map<string, JobMetrics[]>();
  for (const m of metrics) groups.set(m.subject, [...(groups.get(m.subject) ?? []), m]);
  const all: Array<[string, JobMetrics[]]> = [["ÖSSZESEN", metrics], ...[...groups.entries()].sort((a, b) => b[1].length - a[1].length)];
  return all.map(([subject, ms]) => {
    const failures: Partial<Record<FailureClass, number>> = {};
    for (const m of ms) if (m.failureClass) failures[m.failureClass] = (failures[m.failureClass] ?? 0) + 1;
    const avg = (f: (m: JobMetrics) => number) => (ms.length ? round2(ms.reduce((a, m) => a + f(m), 0) / ms.length) : 0);
    const success = ms.filter((m) => m.success).length;
    return {
      subject, runs: ms.length, success, successRate: ms.length ? round2(success / ms.length) : 0, failures,
      avgBankNotes: avg((m) => m.lektorBankNotes), avgTeachNotes: avg((m) => m.lektorTeachNotes), avgBankOnlyRounds: avg((m) => m.bankOnlyRounds),
    };
  });
}
