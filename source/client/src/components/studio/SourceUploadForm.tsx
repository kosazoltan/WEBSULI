import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  downscaleTargetOf,
  oneStepSubmitDisabledReason,
  shouldDownscale,
  sourceFileFromRead,
  type SourceFile,
} from "@shared/studio-ui";
import { useQuery } from "@tanstack/react-query";
import { CreationProgress } from "./CreationProgress";

const RUN_STORAGE_KEY = "websuli.studio.oneStepRunId";
function readPersistedRunId(): string | null {
  try { return sessionStorage.getItem(RUN_STORAGE_KEY); }
  catch { return null; } // Storage may be unavailable in a restricted browser.
}

/**
 * LS-2a-fix (board #157) — the missing source-upload form.
 *
 * The trap this closes: the map list's empty state told the admin to "upload a
 * source", but no upload existed anywhere — the extract endpoint was orphaned.
 * This form reads the files client-side (text as text, pdf/image/docx as a
 * data URL — the shape the extractor expects), then POSTs
 * /api/studio/maps/extract. On success the map list refreshes and the new map
 * opens for curation.
 */

function readFileFor(file: File): Promise<string> {
  const isText = /\.(txt|md)$/i.test(file.name);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Nem sikerült beolvasni: ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

/**
 * #163 — a fotót feltöltés ELŐTT kicsinyítjük (leghosszabb él 1600px, JPEG
 * 0.85): az OCR-nek bőven elég, a vision-hívás töredék tokenből megvan, és a
 * kérés is kisebb. A döntési számok a shared/studio-ui.ts-ben, unit-tesztelve.
 */
function downscaleImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl); // nem dekódolható: eredeti megy
    img.onload = () => {
      if (!shouldDownscale("image", img.naturalWidth, img.naturalHeight)) return resolve(dataUrl);
      const { width, height } = downscaleTargetOf(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

export function SourceUploadForm({
  onCreated,
  onReview,
  persistRun = false,
  showMapOnlyAction = true,
  headerless = false,
}: {
  onCreated?: (mapId: string) => void;
  onReview?: (mapId: string) => void;
  /** Only the main lesson form owns the persistent run monitor. */
  persistRun?: boolean;
  /**
   * LS-8 (#191): a kurátori „Csak tudás-térkép" gomb. A tananyagkészítés fülön
   * `false` — ott a tudástár építése a folyamat láthatatlan része.
   */
  showMapOnlyAction?: boolean;
  /** A befoglaló kártya adja a címet/leírást (nincs dupla fejléc). */
  headerless?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<SourceFile[]>([]);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    for (const file of Array.from(list)) {
      try {
        const content = await readFileFor(file);
        const source = sourceFileFromRead(file.name, content);
        if (!source) {
          toast({
            title: "Nem támogatott fájl",
            description: `${file.name} — pdf, kép, docx vagy txt/md tölthető fel.`,
            variant: "destructive",
          });
          continue;
        }
        // #163: fotó kicsinyítése feltöltés előtt (olcsóbb OCR, kisebb kérés).
        const finalSource =
          source.kind === "image" ? { ...source, content: await downscaleImage(source.content) } : source;
        setFiles((prev) => [...prev.filter((f) => f.name !== finalSource.name), finalSource]);
      } catch (e) {
        toast({ title: "Beolvasási hiba", description: (e as Error).message, variant: "destructive" });
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const extract = useMutation({
    mutationFn: () =>
      apiRequest<{ mapId: string; cached: boolean }>(
        "POST",
        "/api/studio/maps/extract",
        { ...(title.trim() !== "" ? { title: title.trim() } : {}), files },
      ),
    onSuccess: (r) => {
      toast({
        title: r.cached ? "Ez a forrás már fel volt dolgozva" : "Tudás-térkép elkészült",
        description: r.cached
          ? "A meglévő térképet nyitottuk meg — ugyanazért a forrásért nem fizetünk kétszer."
          : "Nézd át a fogalmakat, majd hagyd jóvá a térképet.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/studio/maps"] });
      setFiles([]);
      setTitle("");
      onCreated?.(r.mapId);
    },
    onError: (e: Error) =>
      toast({ title: "A kivonatolás nem sikerült", description: e.message, variant: "destructive" }),
  });

  // Feltöltés → tudástár → lecke. A tantárgyat és évfolyamot a forrás határozza meg.
  // LS-6b (#165): a szerver 202 + runId-t ad azonnal; a futást a fázispanel
  // pollozza, hogy a tanár LÁSSA, melyik gyártási lépés fut éppen.
  const [runId, setRunId] = useState<string | null>(() => persistRun ? readPersistedRunId() : null);
  useEffect(() => {
    if (!persistRun) return;
    try {
      if (runId) sessionStorage.setItem(RUN_STORAGE_KEY, runId);
      else sessionStorage.removeItem(RUN_STORAGE_KEY);
    } catch { /* The live status remains available without browser storage. */ }
  }, [runId, persistRun]);
  const oneStep = useMutation({
    mutationFn: () =>
      apiRequest<{ runId: string }>(
        "POST",
        "/api/studio/lessons/one-step",
        // The source determines subject and grade; the author supplies only files/title.
        { ...(title.trim() !== "" ? { title: title.trim() } : {}), files },
      ),
    onSuccess: (r) => {
      prevFinished.current = false;
      setRunId(r.runId);
    },
    onError: (e: Error) =>
      toast({ title: "Az egylépeses gyártás nem sikerült", description: e.message, variant: "destructive" }),
  });

  const run = useQuery<{
    phase: string;
    detail: string | null;
    error: string | null;
    mapId: string | null;
    lessonId: string | null;
    htmlFileId?: string | null;
  }>({
    queryKey: ["/api/studio/lessons/one-step", runId],
    queryFn: async () => {
      const result = await apiRequest<{ phase: string; detail: string | null; error: string | null; mapId: string | null; lessonId: string | null; htmlFileId?: string | null }>("GET", `/api/studio/lessons/one-step/${runId}`);
      if (result.phase === "done" && !result.htmlFileId) throw new Error("A futás lezárult, de nincs elérhető, közzétett tananyag. A készítést ellenőrizni kell.");
      return result;
    },
    enabled: runId !== null,
    refetchInterval: (query) => {
      const phase = query.state.data?.phase;
      return phase === "done" || phase === "error" || phase === "parked" ? false : 2500;
    },
    // #166 — a poll háttér-fülben/fókuszvesztéskor is fusson: e nélkül a jelző
    // "befagyott" (OCR 8/10), miközben a szerver rég továbbhaladt.
    refetchIntervalInBackground: true,
  });

  const runFinished = run.data?.phase === "done" || run.data?.phase === "error" || run.data?.phase === "parked";
  const prevFinished = useRef(false);
  useEffect(() => {
    if (runFinished && !prevFinished.current) {
      void queryClient.invalidateQueries({ queryKey: ["/api/studio/maps"] });
      if (run.data?.phase === "done" && run.data.htmlFileId) {
        void queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
        setFiles([]);
        setTitle("");
        if (run.data.mapId) onCreated?.(run.data.mapId);
      } else {
        toast({ title: "Az új tananyag még nem készült el", description: run.data?.error ?? run.data?.detail ?? "A gyártás megállt.", variant: "destructive" });
      }
    }
    prevFinished.current = runFinished;
  }, [runFinished, run.data, queryClient, onCreated, toast]);

  const blocked = oneStepSubmitDisabledReason("", Number.NaN, files.length);
  const oneStepBlocked = oneStepSubmitDisabledReason("", Number.NaN, files.length);
  const runActive = runId !== null && !runFinished;
  const busy = extract.isPending || oneStep.isPending || runActive;

  return (
    <Card data-testid="source-upload-form">
      {!headerless && (
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileUp className="w-4 h-4 text-emerald-600" />
            Forrás feltöltése — új tudás-térkép
          </CardTitle>
          <CardDescription className="text-xs">
            Tölts fel tananyag-forrást (pdf, kép, docx, txt) — a gép fogalomjegyzéket kivonatol
            belőle, te átnézed és jóváhagyod, és abból készül a lecke.
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {headerless && (
          <p className="text-xs text-muted-foreground" data-testid="one-step-hint">
            Csak a forrást töltsd fel. A program a tartalomból felismeri a tantárgyat és az
            osztályt; címet külön is megadhatsz.
          </p>
        )}
        <div className="grid gap-2">
          <Input
            placeholder="Cím (nem kötelező)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-11"
            data-testid="extract-title"
          />
        </div>
        {!headerless && <p className="text-sm text-muted-foreground">A tantárgyat és az osztályt a program a feltöltött tananyagból határozza meg.</p>}

        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => void addFiles(e.target.files)}
          data-testid="extract-file-input"
        />
        <Button
          variant="outline"
          className="min-h-11 gap-1"
          onClick={() => fileInput.current?.click()}
          data-testid="extract-pick-files"
        >
          <Upload className="w-4 h-4" />
          Fájlok kiválasztása
        </Button>

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" data-testid="extract-file-list">
            {files.map((f) => (
              <li key={f.name}>
                <Badge variant="secondary" className="gap-1">
                  {f.name} · {f.kind}
                  <button
                    onClick={() => setFiles((prev) => prev.filter((p) => p.name !== f.name))}
                    aria-label={`${f.name} eltávolítása`}
                    className="ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="min-h-11 gap-1"
            disabled={oneStepBlocked !== null || busy}
            onClick={() => oneStep.mutate()}
            data-testid="one-step-submit"
          >
            {oneStep.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Tananyag készítése
          </Button>
          {/* LS-8 (#191): a „csak tudás-térkép" a KURÁTORI út gombja. A
              tananyagkészítés fülön nem jelenik meg — ott a tudástár építése
              a folyamat láthatatlan része, nem külön felhasználói döntés. */}
          {showMapOnlyAction && (
            <Button
              variant="outline"
              className="min-h-11 gap-1"
              disabled={blocked !== null || busy}
              onClick={() => extract.mutate()}
              data-testid="extract-submit"
            >
              {extract.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              Csak tudás-térkép
            </Button>
          )}
          {(oneStepBlocked ?? (showMapOnlyAction ? blocked : null)) && !busy && (
            <span className="text-xs text-muted-foreground">
              {oneStepBlocked ?? blocked}
            </span>
          )}
          {busy && (
            <span className="text-xs text-muted-foreground">
              A gép dolgozik a forráson — a lépések lent követhetők.
            </span>
          )}
        </div>

        {runId !== null && run.isError && <div role="alert" className="rounded-md border border-red-300 p-3 text-sm space-y-2" data-testid="one-step-status-error">
          <p>Nem sikerült ellenőrizni a tananyagkészítés állapotát. {run.error.message}</p>
          <Button variant="outline" onClick={() => void run.refetch()}>Állapot újraellenőrzése</Button>
          <Button variant="ghost" onClick={() => setRunId(null)}>Bezárás</Button>
        </div>}
        {runId !== null && run.data && !run.isError && (
          <div className="rounded-md border p-3 space-y-1.5" data-testid="one-step-progress">
            <p className="text-sm font-medium">
              {run.data.phase === "done"
                ? "A tananyag elkészült ✔"
                : run.data.phase === "error"
                  ? "A gyártás megállt hibával"
                  : run.data.phase === "parked"
                    ? "Az új tananyag még nem készült el — forrásellenőrzés szükséges"
                    : "Tananyag készül…"}
            </p>
            <CreationProgress run={run.data} />
            {(run.data.phase === "done" || run.data.phase === "error" || run.data.phase === "parked") && (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {run.data.phase === "done" && run.data.htmlFileId && (
                  <Button asChild size="sm" data-testid="one-step-open-lesson">
                    <a href={`/preview/${run.data.htmlFileId}`}>Lecke megnyitása</a>
                  </Button>
                )}
                {(run.data.phase === "parked" || run.data.phase === "error") && run.data.mapId && onReview && <Button variant="outline" size="sm" data-testid="one-step-review-source" onClick={() => onReview(run.data!.mapId!)}>
                  Forrásellenőrzés megnyitása
                </Button>}
                <Button variant="ghost" size="sm" onClick={() => setRunId(null)}>
                  Bezárás
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
