import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";

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
import { KnowledgeMapPanel } from "@/components/studio/KnowledgeMapEditor";
import { feedbackPanelVisible, lessonStudioView } from "@shared/studio-ui";

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
  const [advancedOpen, setAdvancedOpen] = useState(initialAdvanced);
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

  const view = lessonStudioView({ maps: mapsData?.maps ?? [] });
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
            Tananyag készítése
          </CardTitle>
          <CardDescription className="text-xs">
            Töltsd fel a tankönyv- vagy füzetoldalak képeit — minden más automatikus:
            a gép felismeri a tantárgyat és az osztályt, fogalomjegyzéket épít belőlük,
            majd megírja és közzéteszi a kész tananyagot. Neked csak a képek feltöltése
            és a kész lecke megnyitása marad.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* A nézet-modell köti a UI-t a tesztelt döntéshez: feltöltés-mód az
              elsődleges, térkép-választó soha nem az. */}
          {view.mode === "upload" && (
            <SourceUploadForm onCreated={() => undefined} showMapOnlyAction={false} headerless />
          )}
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

      {/* Haladó: a régi, kurátori (térkép-alapú) út. Alapértelmezésben rejtve —
          a tulajdonosnak nem kell látnia a tudástár létrehozását. A blokk akkor
          is elérhető, ha még nincs térkép (a KnowledgeMapPanel miatt). */}
      <Card>
        <CardHeader className="py-3">
          <Button
            variant="ghost"
            className="h-auto justify-start gap-2 p-0 text-xs text-muted-foreground hover:bg-transparent"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            data-testid="studio-advanced-toggle"
          >
            {advancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Haladó: tudás-térképek kézi kezelése
          </Button>
        </CardHeader>
        {advancedOpen && (
          <CardContent className="space-y-4" data-testid="studio-advanced-body">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Meglévő, jóváhagyott tudás-térképből is indítható lecke — ez a
                folyamat a fenti automatikus úthoz nem szükséges.
              </p>
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
                Lecke-készítés indítása térképből
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
