import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, ChevronRight, Globe, Loader2, Sparkles, Upload } from "lucide-react";

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
import { SourceUploadForm } from "@/components/studio/SourceUploadForm";
import { WebResearchAgentPanel } from "@/components/studio/WebResearchAgentPanel";
import { KnowledgeMapEditor, KnowledgeMapPanel } from "@/components/studio/KnowledgeMapEditor";
import { CREATOR_PAGE_SCALE, feedbackPanelVisible, lessonStudioView } from "@shared/studio-ui";

/**
 * LS-8 (#191) — a tananyagkészítés EGY menüpont, és önmagában elég.
 *
 * A tulajdonos kérése (2026-09-06): „Én csak a tananyag készítésnél annyit
 * szeretnék látni, hogy töltsön föl a képeket, és utána a kész tananyagot…
 * Maga a tudástár előállítás is a szkennelt szövegből adott címmel, témával,
 * osztállyal legyen teljesen automatizált."
 *
 * MÉRVE: a háttérfolyamat ezt már tudta — az egylépéses futás (LS-6) a
 * feltöltött képekből maga ismeri fel a tantárgyat/osztályt, épít tudás-térképet
 * és megírja a leckét, a #189 óta emberi kapuk nélkül. A hiba a MENÜSZERVEZÉSBEN
 * volt: az egygombos űrlap a „Tudás-térkép" fül alatt lakott, ez a panel pedig
 * egy JÓVÁHAGYOTT térkép kiválasztását követelte. Ezért kellett külön tudástárat
 * készíteni ahhoz, hogy tananyag készülhessen.
 *
 * Ezért itt a feltöltés az ELSŐDLEGES és egyetlen látható út; a kurátori
 * (térkép-alapú) folyamat nem szűnik meg, csak egy összecsukott „haladó" blokkba
 * kerül, hogy a meglévő térképek és a ?tab=knowledge-maps deep link ne törjenek el.
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

export default function LessonStudioPanel({ initialAdvanced = false }: { initialAdvanced?: boolean }) {
  const { toast } = useToast();
  const [mapId, setMapId] = useState<string>("");
  const [reviewMapId, setReviewMapId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(initialAdvanced);
  // Audit 2026-09-05 (E): survive a reload mid-pipeline — the server job keeps running,
  // the admin must not lose the monitor / approval / notes view.
  const [jobId, setJobId] = useState<string | null>(() => readPersistedJobId());
  const [studioMode, setStudioMode] = useState<"upload" | "web">("upload");
  useEffect(() => persistJobId(jobId), [jobId]);

  const { data: mapsData, isLoading: mapsLoading } = useQuery<{ maps: MapListItem[] }>({
    queryKey: ["/api/studio/maps"],
    queryFn: () => apiRequest("GET", "/api/studio/maps"),
    enabled: advancedOpen,
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

  const view = lessonStudioView({ maps: mapsData?.maps ?? [] });
  const selectedMap = mapsData?.maps.find((m) => m.id === mapId);
  const step = jobData?.job.step;
  const outlineReady = step === "author" || step === "animator" || step === "lektor" || step === "gate" || step === "done";
  const notesReady = step === "lektor" || step === "gate" || step === "done";

  return (
    <div
      className="space-y-4 origin-top-left"
      data-testid="creator-page-scale"
      style={{ zoom: CREATOR_PAGE_SCALE }}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={studioMode === "upload" ? "default" : "outline"}
          className="min-h-11 gap-1"
          onClick={() => setStudioMode("upload")}
          data-testid="studio-mode-upload"
        >
          <Upload className="w-4 h-4" />
          Feltöltés
        </Button>
        <Button
          size="sm"
          variant={studioMode === "web" ? "default" : "outline"}
          className="min-h-11 gap-1"
          onClick={() => setStudioMode("web")}
          data-testid="studio-mode-web"
        >
          <Globe className="w-4 h-4" />
          Internetes keresés
        </Button>
      </div>
      {studioMode === "web" ? (
        <WebResearchAgentPanel />
      ) : (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Tananyag készítése
          </CardTitle>
          <CardDescription className="text-xs">
            Töltsd fel a tankönyv- vagy füzetoldalakat. A program feldolgozza a forrást,
            megállapítja az évfolyamot, majd elkészíti és ellenőrzi a tananyagot.
            Ha fontos forrásrész bizonytalan, jelzi, mit kell átnézni.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* A nézet-modell köti a UI-t a tesztelt döntéshez: feltöltés-mód az
              elsődleges, térkép-választó soha nem az. */}
          {view.mode === "upload" && (
            <><SourceUploadForm onReview={setReviewMapId} showMapOnlyAction={false} headerless />
            {reviewMapId && <div className="mt-4 space-y-3" data-testid="one-step-source-review">
              <Button variant="ghost" onClick={() => setReviewMapId(null)}>Forrásellenőrzés bezárása</Button>
              <KnowledgeMapEditor mapId={reviewMapId} />
            </div>}</>
          )}
        </CardContent>
      </Card>
      )}

      {jobId && <JobMonitor jobId={jobId} />}

      {jobId && outlineReady && selectedMap && (advancedOpen || !jobData?.produced.approvedOutline) && (
        <OutlineReview jobId={jobId} mapId={selectedMap.id} />
      )}

      {jobId && notesReady && <LektorNotes jobId={jobId} />}

      {jobData && feedbackPanelVisible(jobData.job.step, jobData.produced.lessonId) && (
        <FeedbackPanel lessonId={jobData.produced.lessonId as string} />
      )}

      {/* Haladó: a régi, kurátori (térkép-alapú) út. Alapértelmezésben rejtve —
          a tulajdonosnak nem kell látnia a tudástár létrehozását. A blokk akkor
          is elérhető, ha még nincs térkép (a KnowledgeMapPanel miatt). */}
      <Card>
        <CardHeader className="py-3">
          <Button
            variant="ghost"
            className="min-h-11 h-auto justify-start gap-2 p-0 text-sm text-muted-foreground hover:bg-transparent"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            data-testid="studio-advanced-toggle"
          >
            {advancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Haladó: forrásjegyzék és ellenőrzés
          </Button>
        </CardHeader>
        {advancedOpen && (
          <CardContent className="space-y-4" data-testid="studio-advanced-body">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Itt láthatók a forrásból azonosított fogalmak és idézetek.
                A jóváhagyott forrásjegyzékből új lecke is indítható.
              </p>
              <Select value={mapId} onValueChange={setMapId}>
                <SelectTrigger className="min-h-11" data-testid="lesson-map-select">
                  <SelectValue placeholder={mapsLoading ? "Források betöltése…" : "Válassz forrásjegyzéket…"} />
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
                  <span>A tantárgyat és évfolyamot a program a forrásból állapította meg.</span>
                </div>
              )}

              <Button
                className="min-h-11 gap-1"
                disabled={mapId === "" || start.isPending}
                onClick={() => start.mutate(mapId)}
                data-testid="start-lesson"
              >
                {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                Tananyag készítése ebből a forrásból
              </Button>
            </div>

            <div className="border-t pt-4">
              <KnowledgeMapPanel />
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
