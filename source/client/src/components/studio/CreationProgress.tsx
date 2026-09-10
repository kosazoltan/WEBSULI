import { Check, CircleDashed, Loader2 } from "lucide-react";
import { lessonCreationStages, ONE_STEP_PHASES, type OneStepRunView } from "@shared/studio-ui";

/** Three human stages; diagnostics remain accessible without obscuring an error. */
export function CreationProgress({ run }: { run: OneStepRunView }) {
  const stopped = run.phase === "error" || run.phase === "parked";
  return <div className="space-y-3" data-testid="creation-progress">
    <ol className="grid gap-2 sm:grid-cols-3" aria-label="A tananyagkészítés három fázisa">
      {lessonCreationStages(run).map((stage, index) => <li key={stage.key}
        data-state={stage.state} aria-current={stage.state === "active" ? "step" : undefined}
        className={`flex min-w-0 items-center gap-2 rounded-lg border p-3 text-sm ${stage.state === "active" ? "border-blue-300 bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-100" : stage.state === "done" ? "border-emerald-300 text-emerald-800 dark:text-emerald-200" : "text-muted-foreground"}`}>
        {stage.state === "done" ? <Check className="h-4 w-4 shrink-0" aria-label="Elkészült" /> : stage.state === "active"
          ? <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-label="Folyamatban" />
          : <CircleDashed className="h-4 w-4 shrink-0" aria-label="Még nincs kész" />}
        <span>{index + 1}. {stage.label}</span>
      </li>)}
    </ol>
    {(run.error || run.detail) && <p role={stopped ? "alert" : "status"}
      className={`break-words text-sm ${stopped ? "font-medium text-amber-900 dark:text-amber-200" : "text-muted-foreground"}`}>
      {run.error ?? run.detail}
    </p>}
    <details className="text-xs text-muted-foreground" data-testid="creation-progress-details">
      <summary className="flex min-h-11 cursor-pointer items-center">Feldolgozási részletek</summary>
      <p>{ONE_STEP_PHASES.find(p => p.key === run.phase)?.label ?? (run.phase === "done" ? "A lecke elkészült." : stopped ? "A folyamat megállt. A részletes ok fent olvasható." : "A forrás fogadása folyamatban.")}</p>
    </details>
  </div>;
}
