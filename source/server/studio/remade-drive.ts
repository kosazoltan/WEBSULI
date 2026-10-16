import { WorkflowWaiting } from "../workflows/engine";

/**
 * docs/specs/2026-10-16-ujragyartas-jovahagyas.md (J1) — az újragyártás végigvitelének tiszta ciklusa (DB nélkül tesztelhető).
 * Review #256 (P1): a `driveTracked` a várakozást (`WorkflowWaiting`) ELNYELI és normálisan tér vissza — ezért minden kör után a job
 * TÉNYLEGES állapota dönt (`awaitingApproval`), nem a kivétel. A jóváhagyás a következő kör `beforeDrive`-jában, a lízing alatt fut.
 */
export type RemadeDeps = {
  drive: (start: boolean, beforeDrive?: () => Promise<void>) => Promise<void>;
  awaitingApproval: () => Promise<boolean>;
  approve: () => Promise<{ outcome: "approved" | "retry" | "failed"; reason: string }>;
  maxRounds: number;
};
export async function driveRemadeWith(deps: RemadeDeps, start = true): Promise<"done" | "waiting" | "approval-failed"> {
  let first = start;
  for (let i = 0; i < deps.maxRounds; i++) {
    let failed: string | null = null;
    try {
      await deps.drive(first, first ? undefined : async () => {
        const result = await deps.approve();
        if (result.outcome === "failed") { failed = result.reason; throw new WorkflowWaiting(result.reason, true); }
      });
    } catch (error) {
      if (!(error instanceof WorkflowWaiting)) throw error;
    }
    if (failed) return "approval-failed";
    first = false;
    // Csak a terv-jóváhagyásnál lépünk tovább; más várakozás (pl. forrásellenőrzés) és a vég (kész / hiba) emberi vagy végleges állapot.
    if (!(await deps.awaitingApproval())) return "done";
  }
  return "waiting";
}

