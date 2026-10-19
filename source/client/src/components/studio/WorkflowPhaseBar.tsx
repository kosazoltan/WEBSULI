import { useQuery } from "@tanstack/react-query";
import { Check, CircleDashed, Loader2, RotateCcw, X, Pause } from "lucide-react";
import type { WorkflowView } from "@shared/lesson-workflow";
import { WORKFLOW_STATE_LABELS, workflowStepDisplay } from "@shared/lesson-workflow";
import { apiRequest } from "@/lib/queryClient";

/**
 * Spec 2026-10-19-okositas-fazisjelzo (1): állandóan látható fázissor egy munkafolyamat-futáshoz (okosítás, javítás). A teljes
 * lépéssort mutatja sorrendben, állapotjellel, az aktuális lépéssel, a körrel és az eltelt idővel; hibánál a teljes üzenettel.
 * Ugyanabból a futásnaplóból él, mint a részletes `WorkflowMonitor` (közös lekérdezési kulcs), így újratöltés után is látszik.
 */
const ICONS = { done: Check, running: Loader2, error: X, waiting: Pause, redo: RotateCcw, pending: CircleDashed } as const;
const TONE = {
  done: "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  running: "border-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100 ring-2 ring-sky-500/40",
  error: "border-red-600 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  waiting: "border-amber-600 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  redo: "border-violet-600 bg-violet-50 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  pending: "border-slate-300 bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300",
} as const;

export function WorkflowPhaseBar({ id, sticky = false, title }: { id: string | null; sticky?: boolean; title?: string }) {
  const query = useQuery<{ run: WorkflowView | null }>({
    queryKey: ["/api/studio/workflows", id],
    queryFn: () => apiRequest("GET", `/api/studio/workflows/${encodeURIComponent(id!)}`),
    enabled: !!id, retry: 1,
    refetchInterval: (q) => (q.state.data?.run ? (["running", "waiting"].includes(q.state.data.run.state) ? 2500 : false) : q.state.dataUpdateCount < 4 ? 2500 : false),
  });
  if (!id) return null;
  const run = query.data?.run;
  const shell = `${sticky ? "sticky top-0 z-20 shadow-md" : ""} rounded-xl border bg-card text-card-foreground p-3 space-y-2`;
  if (!run) {
    return (
      <section className={shell} data-testid="phase-bar" data-run-state="unknown" aria-live="polite">
        <p className="text-sm font-medium">{title ?? "Folyamat"}</p>
        <p className="text-xs text-muted-foreground">{query.isPending ? "A fázisok betöltése…" : "Ehhez a futáshoz még nincs fázisnapló."}</p>
      </section>
    );
  }
  const current = run.visits.at(-1);
  const currentStep = current ? run.definition.steps.find((s) => s.id === current.step) : undefined;
  const round = current ? run.visits.filter((v) => v.step === current.step).length : 0;
  // Review #323: a szívverés csak a bérletet frissíti, a `run` változatlan maradhat — az „most” a sikeres lekérdezés ideje
  // (minden 2,5 mp-es lekérdezéssel változik, így újrarajzol), nem a renderkori `Date.now()`.
  const minutes = Math.max(0, Math.round(((run.state === "running" || run.state === "waiting" ? query.dataUpdatedAt : run.updatedAt) - run.createdAt) / 60_000));
  const failed = [...run.visits].reverse().find((v) => v.state === "error");
  const errorText = run.error ?? failed?.error;
  return (
    <section className={shell} data-testid="phase-bar" data-run-state={run.state} aria-live="polite" aria-label={`${title ?? run.definition.label} fázisai`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold">{title ?? run.definition.label}: {WORKFLOW_STATE_LABELS[run.state]}</p>
        <p className="text-xs text-muted-foreground" data-testid="phase-bar-current">
          {currentStep ? `${run.definition.steps.indexOf(currentStep) + 1}/${run.definition.steps.length}. ${currentStep.label}${round > 1 ? ` · ${round}. kör` : ""}` : "Indul…"} · {minutes} perc
        </p>
      </div>
      <ol className="flex flex-wrap gap-1.5" aria-label="Fázissorrend">
        {run.definition.steps.map((step, i) => {
          const shown = workflowStepDisplay(run, step.id);
          const Icon = ICONS[shown.state];
          return (
            <li key={step.id} data-step={step.id} data-state={shown.state} title={shown.label}
              className={`flex min-w-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${TONE[shown.state]}`}>
              <Icon className={`h-3.5 w-3.5 shrink-0 ${shown.state === "running" ? "animate-spin" : ""}`} aria-hidden="true" />
              <span className="break-words">{i + 1}. {step.label}</span>
              <span className="sr-only"> — {shown.label}</span>
            </li>
          );
        })}
      </ol>
      {errorText && (run.state === "error" || run.state === "interrupted" || failed) && (
        <details className="text-xs" data-testid="phase-bar-error">
          <summary className="cursor-pointer text-red-700 dark:text-red-300">Megállt{failed ? `: ${run.definition.steps.find((s) => s.id === failed.step)?.label ?? failed.step}` : ""} — részletek</summary>
          <p className="mt-1 whitespace-pre-wrap break-words">{errorText}</p>
        </details>
      )}
    </section>
  );
}
