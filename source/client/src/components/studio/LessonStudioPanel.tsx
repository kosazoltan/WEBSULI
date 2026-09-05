import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { JobMonitor } from "@/components/studio/JobMonitor";
import { OutlineReview } from "@/components/studio/OutlineReview";
import { LektorNotes } from "@/components/studio/LektorNotes";
import { FeedbackPanel } from "@/components/studio/FeedbackPanel";
import { feedbackPanelVisible } from "@shared/studio-ui";

/**
 * LS-2c — the "Lecke készítése" flow, one screen, three phases:
 *
 *  1. pick a curated map → POST /api/studio/lessons/from-map/:mapId (subject/classroom
 *     come from the map — one source of truth, the server 409s on a mismatch);
 *  2. the monitor polls the job while the pedagogue works, then the outline review
 *     takes over for the admin gate;
 *  3. after approval the author + lektor run; the lektor's notes (with the admin-only
 *     box) appear when the lektor step has reported.
 */

type MapListItem = { id: string; title: string; subject: string; classroom: number; status: string };

type JobResponse = {
  job: { id: string; step: string; status: string; round: number };
  produced: { outline: unknown; approvedOutline: boolean; lessonId: string | null };
};

const JOB_STORAGE_KEY = "websuli.studio.jobId";

function readPersistedJobId(): string | null {
  try {
    return window.sessionStorage.getItem(JOB_STORAGE_KEY);
  } catch {
    return null; // private mode / storage disabled — behave like a fresh panel
  }
}

function persistJobId(jobId: string | null): void {
  try {
    if (jobId) window.sessionStorage.setItem(JOB_STORAGE_KEY, jobId);
    else window.sessionStorage.removeItem(JOB_STORAGE_KEY);
  } catch {
    // storage unavailable: nothing to persist, the panel still works for this session
  }
}

export default function LessonStudioPanel() {
  const { toast } = useToast();
  const [mapId, setMapId] = useState<string>("");
  // Audit 2026-09-05 (E): survive a reload mid-pipeline — the server job keeps running,
  // the admin must not lose the monitor / approval / notes view.
  const [jobId, setJobId] = useState<string | null>(() => readPersistedJobId());
  useEffect(() => persistJobId(jobId), [jobId]);

  const { data: mapsData, isLoading: mapsLoading } = useQuery<{ maps: MapListItem[] }>({
    queryKey: ["/api/studio/maps"],
    queryFn: () => apiRequest("GET", "/api/studio/maps"),
  });

  const { data: jobData } = useQuery<JobResponse>({
    queryKey: ["/api/studio/jobs", jobId],
    queryFn: () => apiRequest("GET", `/api/studio/jobs/${jobId}`),
    enabled: jobId !== null,
  });

  const start = useMutation({
    mutationFn: (id: string) => apiRequest<{ jobId: string }>("POST", `/api/studio/lessons/from-map/${id}`, {}),
    onSuccess: (r) => setJobId(r.jobId),
    onError: (e: Error) =>
      toast({ title: "Nem indítható a lecke-készítés", description: e.message, variant: "destructive" }),
  });

  const selectedMap = mapsData?.maps.find((m) => m.id === mapId);
  const step = jobData?.job.step;
  const outlineReady = step === "author" || step === "lektor" || step === "gate" || step === "done";
  const notesReady = step === "lektor" || step === "gate" || step === "done";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Lecke készítése
          </CardTitle>
          <CardDescription className="text-xs">
            Válassz egy jóváhagyott tudás-térképet — a gépsor ebből írja meg a leckét:
            először a pedagógus vázlatot készít, te azt hagyd jóvá, majd a szerző megírja,
            és a lektor ellenőrzi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={mapId} onValueChange={setMapId}>
            <SelectTrigger className="min-h-11" data-testid="lesson-map-select">
              <SelectValue placeholder={mapsLoading ? "Térképek betöltése…" : "Válassz tudás-térképet…"} />
            </SelectTrigger>
            <SelectContent>
              {(mapsData?.maps ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id} disabled={m.status !== "approved"}>
                  {m.title} · {m.subject} · {m.classroom}. o.
                  {m.status !== "approved" ? " (nem jóváhagyott)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedMap && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{selectedMap.subject}</Badge>
              <Badge variant="outline">{selectedMap.classroom}. osztály</Badge>
              <span>A lecke a térkép szerinti tantárgyból és osztályba készül.</span>
            </div>
          )}

          <Button
            className="min-h-11 gap-1"
            disabled={mapId === "" || start.isPending}
            onClick={() => start.mutate(mapId)}
            data-testid="start-lesson"
          >
            {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
            Lecke-készítés indítása
          </Button>
        </CardContent>
      </Card>

      {jobId && <JobMonitor jobId={jobId} />}

      {jobId && outlineReady && selectedMap && (
        <OutlineReview jobId={jobId} mapId={selectedMap.id} />
      )}

      {jobId && notesReady && <LektorNotes jobId={jobId} />}

      {jobData && feedbackPanelVisible(jobData.job.step, jobData.produced.lessonId) && (
        <FeedbackPanel lessonId={jobData.produced.lessonId as string} />
      )}
    </div>
  );
}
