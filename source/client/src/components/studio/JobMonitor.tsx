import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { jobMonitorView, lessonCreationStageLabel, type JobSummary } from "@shared/studio-ui";
import { telemetryView, type RunTelemetry } from "@shared/run-telemetry";
import { WorkflowMonitor } from "./WorkflowMonitor";

/**
 * LS-2c — the lesson pipeline monitor: polls GET /api/studio/jobs/:id every 2 seconds
 * while the job is pending/running, then shows the settled state.
 *
 * The polling decision and the Hungarian labels come from the pure `jobMonitorView`
 * helper (shared/studio-ui.ts, unit-tested); this component is presentation only.
 */

const POLL_MS = 2000;

export type JobMonitorProps = {
  jobId: string;
  /** Called once when the job reaches a state the client can stop watching. */
  onDone?: (job: JobSummary) => void;
  /** Review #260: a folytatás új (egyfutásos) futást indított — a hívó ezt a futást követi tovább. */
  onFollowRun?: (runId: string) => void;
};

export function JobMonitor({ jobId, onDone, onFollowRun }: JobMonitorProps) {
  const { data, isError, error } = useQuery<{
    job: JobSummary;
    produced: {
      approvedOutline?: boolean;
      qualityNotes?: Array<{ reason?: string; note?: string; round?: number }>;
      gaps?: Array<{ id: string; point: string; reason: string }>;
      telemetry?: RunTelemetry | null;
    };
  }>({
    queryKey: ["/api/studio/jobs", jobId],
    queryFn: () => apiRequest("GET", `/api/studio/jobs/${jobId}`),
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job && jobMonitorView(job, query.state.data?.produced).polling ? POLL_MS : false;
    },
    retry: false,
    enabled: jobId.length > 0,
  });

  // Audit 2026-09-05 (E): fire onDone ONCE per finished job, not once per render.
  // #182: hooks BEFORE the early returns below — a hook after a conditional return
  // changes the hook count between renders and crashes the whole admin page (React #310).
  const doneFor = useRef<string | null>(null);
  const finished = data ? jobMonitorView(data.job, data.produced).finished : false;
  useEffect(() => {
    if (!finished) doneFor.current = null;
    if (finished && data && onDone && doneFor.current !== jobId) {
      doneFor.current = jobId;
      onDone(data.job);
    }
  }, [finished, jobId, onDone, data]);

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Nem sikerült lekérdezni a készítés állapotát
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Ismeretlen hiba."}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Állapot betöltése…
      </div>
    );
  }

  const view = jobMonitorView(data.job, data.produced);

  return (
    <Card data-testid="job-monitor">
      <CardHeader>
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <span>A lecke-készítés állapota</span>
          <Badge
            variant="outline"
            className={
              data.job.status === "error"
                ? "border-red-300 text-red-700 dark:text-red-300"
                : view.waitingApproval
                  ? "border-amber-300 text-amber-700 dark:text-amber-300"
                  : "border-emerald-300 text-emerald-700 dark:text-emerald-300"
            }
          >
            {data.job.status === "error" ? (
              <AlertTriangle className="w-3 h-3" />
            ) : view.finished ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Clock className="w-3 h-3" />
            )}
            {view.statusLabel}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          <strong>{lessonCreationStageLabel(data.job.step)}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <WorkflowMonitor id={jobId} />
        <details className="text-xs text-muted-foreground">
          <summary className="flex min-h-11 cursor-pointer items-center">Feldolgozási részletek</summary>
          <p>{view.stepLabel}{view.roundLabel ? ` · ${view.roundLabel}` : ""}</p>
        </details>
        {data.produced.telemetry && <TelemetryTable telemetry={data.produced.telemetry} />}
        {view.waitingApproval && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            A vázlat jóváhagyásra vár — a lenti vázlatot átnézve folytathatod.
          </p>
        )}

        {data.job.status === "error" && (
          <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 space-y-2">
            <p className="text-sm text-red-700 dark:text-red-300 flex items-start gap-1">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {data.job.error ?? "Ismeretlen hiba."}
            </p>
            <ResumeButton jobId={jobId} onFollowRun={onFollowRun} />
          </div>
        )}

        {data.job.step === "gate" && (
          <p className="text-sm text-muted-foreground">
            A tanítás teljességét és szerkezetét ellenőrizzük. Siker esetén a lecke megjelenik a főoldalon.
          </p>
        )}

        {!view.polling && !view.waitingApproval && data.job.status === "ok" && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            {view.stepLabel === "Kész" ? "A lecke elkészült." : "Ez a lépés elkészült."}
          </p>
        )}

        {Array.isArray(data.produced.gaps) && data.produced.gaps.length > 0 && (
          <div className="rounded border border-slate-300 bg-slate-50 dark:bg-slate-900/40 p-3 space-y-2" data-testid="studio-instruction-gaps">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              A tanár kérésének forrásból nem igazolható pontjai (ezeket a lecke nem tanítja)
            </p>
            <ul className="text-sm text-slate-800 dark:text-slate-200 list-disc list-inside space-y-1">
              {data.produced.gaps.map((g) => (
                <li key={g.id}>{g.point} — {g.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(data.produced.qualityNotes) && data.produced.qualityNotes.length > 0 && (
          <div
            className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2"
            data-testid="studio-quality-notes"
          >
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Minőségi jelzés
            </p>
            <ul className="text-sm text-amber-900 dark:text-amber-200 list-disc list-inside space-y-1">
              {data.produced.qualityNotes.map((n, i) => (
                <li key={`${n.reason ?? "note"}-${i}`}>
                  {n.note ?? n.reason ?? "Ismeretlen minőségi megjegyzés"}
                  {typeof n.round === "number" ? ` (kör ${n.round})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** J3: a futás mérőszámai (állomásonként forduló, token, gyorsítótár, idő; kapuesemények) — összecsukva, kompakt táblában. */
function TelemetryTable({ telemetry }: { telemetry: RunTelemetry }) {
  const view = telemetryView(telemetry);
  return (
    <details className="text-xs text-muted-foreground" data-testid="studio-run-telemetry">
      <summary className="flex min-h-11 cursor-pointer items-center">Mérőszámok: {view.summary}</summary>
      <div className="overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr><th className="pr-2">Állomás</th><th className="pr-2">Forduló</th><th className="pr-2">Bemenet</th><th className="pr-2">Gyors.</th><th className="pr-2">Kimenet</th><th>Idő</th></tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.station}><td className="pr-2">{r.station}</td><td className="pr-2">{r.turns}</td><td className="pr-2">{r.input}</td><td className="pr-2">{r.cachedPct}</td><td className="pr-2">{r.output}</td><td>{r.time}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.gates.length > 0 && (
        <ul className="list-disc list-inside mt-1">
          {view.gates.map((g) => <li key={g}>{g}</li>)}
        </ul>
      )}
    </details>
  );
}

/** Retry button for a failed job — POST /jobs/:id/resume is input-hash idempotent. */
function ResumeButton({ jobId, onFollowRun }: { jobId: string; onFollowRun?: (runId: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  // Local mutation state; a full useMutation here would need the toast anyway.
  const onResume = async () => {
    if (pending) return; // audit 2026-09-05 (E): no double POST on a slow restart
    setPending(true);
    try {
      const started = await apiRequest<{ runId?: string } | undefined>("POST", `/api/studio/jobs/${jobId}/resume`);
      // Review #260: egyfutásos módban a folytatás új futás — a felület azt követi, nem a régi (hibás) jobot.
      if (started?.runId && onFollowRun) {
        onFollowRun(started.runId);
        toast({ title: "Újragyártás elindult", description: "A mentett forrásból új gyártás indult; a haladás itt követhető." });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/studio/jobs", jobId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/studio/workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/studio/lessons/one-step"] }),
      ]);
      toast({ title: "Újraindítás", description: "A gépsor tovább fut." });
    } catch (e) {
      toast({
        title: "Nem sikerült újraindítani",
        description: e instanceof Error ? e.message : "Ismeretlen hiba.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button size="sm" className="min-h-11" onClick={() => void onResume()} disabled={pending}>
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Újra"}
    </Button>
  );
}
