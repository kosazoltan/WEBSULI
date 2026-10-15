import { ORPHAN_JOB_ERROR } from "./orphan-jobs";
/**
 * Elakadás-vezérlő V3 (docs/specs/2026-10-15-elakadas-vezerlo.md): a hibával megállt jobok közül azok, amelyeket a vezérlő MOST automatikusan
 * továbbvihet — tiszta függvény (DB nélkül tesztelhető). A tulajdonos kézi döntése elsőbbséget kap (2 perc várakozás a megállás után).
 */
export const RECOVERY_GRACE_MS = 2 * 60_000;

export type RecoveryRow = {
  id: string; status: string; step: string; error: string | null; finishedAt: Date | null; hasLesson: boolean; published: boolean;
  runId: string | null; owner: string | null; runState: string | null; leaseUntil: Date | null; recoveryState: string | null;
};

/** `null` = folytatható most; különben a kihagyás oka (naplózáshoz). */
export function recoveryCandidate(row: RecoveryRow, now: number): string | null {
  if (row.status !== "error" || row.step !== "error") return "nem hibás";
  if (!row.hasLesson) return "nincs mentett lecke";
  if (row.published) return "publikált";
  if (!row.runId || !row.owner) return "nincs workflow-napló";
  // Újraindulás miatt lezárt job: a futása `interrupted` (a halott folyamaté) — ez is folytatható (docs/specs/2026-10-15-ujraindulas-utani-folytatas.md).
  if (row.runState !== "error" && !(row.runState === "interrupted" && row.error === ORPHAN_JOB_ERROR)) return "a workflow nem hibás állapotú";
  if (row.recoveryState === "ask-owner") return "tulajdonosi döntésre vár";
  if (row.recoveryState === "remanufactured") return "újragyártva (új job viszi tovább)";
  if (row.recoveryState === "remanufacturing") return "újragyártás folyamatban";
  if (row.recoveryState === "superseded") return "ugyanabból a forrásból újabb gyártás fut";
  if (row.leaseUntil && row.leaseUntil.getTime() > now) return "élő lízing";
  if (!row.finishedAt || now - row.finishedAt.getTime() < RECOVERY_GRACE_MS) return "türelmi idő";
  if (!row.error) return "nincs hibaszöveg";
  return null;
}
