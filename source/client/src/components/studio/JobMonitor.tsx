import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { jobMonitorView, type JobSummary } from "@shared/studio-ui";

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
};

export function JobMonitor({ jobId, onDone }: JobMonitorProps) {
  const { data, isError, error } = useQuery<{ job: JobSummary; produced: { approvedOutline?: boolean } }>({
    queryKey: ["/api/studio/jobs", jobId],
    queryFn: () => apiRequest("GET", `/api/studio/jobs/${jobId}`),
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job && jobMonitorView(job, query.state.data?.produced).polling ? POLL_MS : false;
    },
    retry: false,
    enabled: jobId.length > 0,
  });

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Nem sikerült lekérdezni a gépsort
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
        <Loader2 className="w-4 h-4 animate-spin" /> Gépsor betöltése…
      </div>
    );
  }

  const view = jobMonitorView(data.job, data.produced);

  // Audit 2026-09-05 (E): fire onDone ONCE per finished job, not once per render.
  const doneFor = useRef<string | null>(null);
  useEffect(() => {
    if (view.finished && onDone && doneFor.current !== jobId) {
      doneFor.current = jobId;
      onDone(data.job);
    }
  }, [view.finished, jobId, onDone, data.job]);

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
          Aktuális lépés: <strong>{view.stepLabel}</strong>
          {view.roundLabel ? ` · ${view.roundLabel}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {view.waitingApproval && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            A gépsor a vázlatod jóváhagyását várja — a lenti vázlatot átnézve folytathatod.
          </p>
        )}

        {data.job.status === "error" && (
          <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 space-y-2">
            <p className="text-sm text-red-700 dark:text-red-300 flex items-start gap-1">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {data.job.error ?? "Ismeretlen hiba."}
            </p>
            <ResumeButton jobId={jobId} />
          </div>
        )}

        {data.job.step === "gate" && (
          <p className="text-sm text-muted-foreground">
            A publikálási kapu fut (séma + fedettség ellenőrzés) — siker esetén a lecke azonnal megjelenik a főoldalon.
          </p>
        )}

        {!view.polling && !view.waitingApproval && data.job.status === "ok" && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            {view.stepLabel === "Kész" ? "A lecke elkészült." : "Ez a lépés elkészült."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Retry button for a failed job — POST /jobs/:id/resume is input-hash idempotent. */
function ResumeButton({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  // Local mutation state; a full useMutation here would need the toast anyway.
  const onResume = async () => {
    if (pending) return; // audit 2026-09-05 (E): no double POST on a slow restart
    setPending(true);
    try {
      await apiRequest("POST", `/api/studio/jobs/${jobId}/resume`);
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
